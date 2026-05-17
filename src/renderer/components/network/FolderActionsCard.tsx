'use memo'
// File: src/renderer/components/network/FolderActionsCard.tsx
//
// #321 E-97 — Folder Action preset library. "When files appear in
// folder X, automatically run actions Y." Use cases: tag everything
// dropped in /downloads/r34 with `source:rule34`, transcode anything
// over 4GB, auto-rename screenshots, etc.
//
// UI surface for the `media.folderActions.*` IPC bridge.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  FolderCog,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  Folder,
  Tag,
  ArrowRight,
  ChevronDown,
} from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

interface ActionStep {
  kind: 'tag' | 'untag' | 'rename' | 'transcode' | 'move' | 'rate' | 'addToPlaylist'
  args?: any
}

interface Preset {
  id: string
  name: string
  folderPath: string
  actions: ActionStep[]
  enabled: boolean
  createdAt: number
}

const ACTION_KINDS: Array<{ kind: ActionStep['kind']; label: string }> = [
  { kind: 'tag', label: 'Add tag' },
  { kind: 'untag', label: 'Remove tag' },
  { kind: 'rename', label: 'Rename (template)' },
  { kind: 'transcode', label: 'Transcode' },
  { kind: 'move', label: 'Move to folder' },
  { kind: 'rate', label: 'Set rating' },
  { kind: 'addToPlaylist', label: 'Add to playlist' },
]

const EMPTY_PRESET: Preset = {
  id: '',
  name: 'New preset',
  folderPath: '',
  actions: [],
  enabled: true,
  createdAt: 0,
}

export function FolderActionsCard() {
  const { showToast } = useToast()
  const [presets, setPresets] = useState<Preset[]>([])
  const [editing, setEditing] = useState<Preset | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await window.api.tags.folderActions.list()
      if (res.ok) setPresets(res.presets ?? [])
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : presets.some((p) => p.enabled)
        ? 'running'
        : presets.length > 0
          ? 'idle'
          : 'idle'

  const onSave = useCallback(async () => {
    if (!editing || !editing.name.trim() || !editing.folderPath.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await window.api.tags.folderActions.save({
        id: editing.id || undefined,
        name: editing.name.trim(),
        folderPath: editing.folderPath.trim(),
        actions: editing.actions,
        enabled: editing.enabled,
      })
      if (!res.ok) throw new Error(res.error ?? 'Save failed')
      showToast?.('success', `Saved preset "${editing.name.trim()}"`)
      setEditing(null)
      refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [editing, refresh, showToast])

  const onDelete = useCallback(async (id: string) => {
    await window.api.tags.folderActions.delete(id)
    refresh()
    if (editing?.id === id) setEditing(null)
  }, [refresh, editing])

  const onToggle = useCallback(async (p: Preset) => {
    await window.api.tags.folderActions.setEnabled({ id: p.id, enabled: !p.enabled })
    refresh()
  }, [refresh])

  const onPickFolder = useCallback(async () => {
    const picked = await window.api.dialogOpenFolder({ title: 'Pick folder to watch' })
    if (picked && editing) setEditing({ ...editing, folderPath: picked })
  }, [editing])

  const addAction = useCallback((kind: ActionStep['kind']) => {
    if (!editing) return
    setEditing({ ...editing, actions: [...editing.actions, { kind, args: {} }] })
  }, [editing])

  const removeAction = useCallback((idx: number) => {
    if (!editing) return
    setEditing({ ...editing, actions: editing.actions.filter((_, i) => i !== idx) })
  }, [editing])

  const updateActionArg = useCallback((idx: number, args: any) => {
    if (!editing) return
    setEditing({
      ...editing,
      actions: editing.actions.map((a, i) => (i === idx ? { ...a, args } : a)),
    })
  }, [editing])

  const enabledCount = presets.filter((p) => p.enabled).length

  return (
    <NetworkServiceCard
      Icon={FolderCog}
      title="Folder actions"
      description="When files appear in a watched folder, automatically run a sequence of actions (tag, rename, transcode, move, etc.). Like Hazel for your media library."
      state={state}
      statusLabel={presets.length > 0 ? `${enabledCount}/${presets.length} active` : undefined}
      accent="from-cyan-500 to-teal-600"
      error={error}
    >
      <div className="space-y-1">
        {presets.map((p) => (
          <motion.div
            key={p.id}
            layout
            transition={SPRINGS.snappy}
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              editing?.id === p.id
                ? 'bg-cyan-500/10 border-cyan-500/30'
                : 'bg-white/[0.03] border-white/5'
            }`}
          >
            <button
              onClick={() => onToggle(p)}
              className={`size-3 rounded-full transition ${
                p.enabled ? 'bg-cyan-400 ring-1 ring-cyan-400/50' : 'bg-zinc-700'
              }`}
              title={p.enabled ? 'Click to disable' : 'Click to enable'}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{p.name}</div>
              <code className="text-[10px] font-mono text-[var(--muted)] truncate block">
                {p.folderPath}
              </code>
            </div>
            <span className="text-[10px] text-cyan-300 tabular-nums">
              {p.actions.length} step{p.actions.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => setEditing(p)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(p.id)}
              className="text-[var(--muted)] hover:text-red-300 transition"
              aria-label="Delete"
            >
              <Trash2 size={12} />
            </button>
          </motion.div>
        ))}
      </div>

      <NetworkActionRow>
        <NetworkGhostBtn onClick={() => setEditing(EMPTY_PRESET)}>
          <Plus size={14} /> New preset
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {editing && (
          <motion.div
            {...FADE_SLIDE}
            className="rounded-2xl bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-200">
                {editing.id ? 'Edit preset' : 'New preset'}
              </span>
              <button onClick={() => setEditing(null)} className="text-[var(--muted)] hover:text-white">
                <X size={12} />
              </button>
            </div>

            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Preset name"
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-cyan-500/50"
            />

            <div className="flex gap-2">
              <input
                value={editing.folderPath}
                onChange={(e) => setEditing({ ...editing, folderPath: e.target.value })}
                placeholder="C:\downloads\r34"
                className="flex-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-cyan-500/50"
              />
              <button
                onClick={onPickFolder}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5"
              >
                <Folder size={12} />
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Actions</div>
              {editing.actions.length === 0 && (
                <div className="text-[11px] text-[var(--muted)] italic px-1">
                  No actions yet. Add steps below.
                </div>
              )}
              {editing.actions.map((a, idx) => (
                <motion.div
                  key={idx}
                  layout
                  transition={SPRINGS.snappy}
                  className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.04] border border-white/5"
                >
                  <span className="text-[10px] text-cyan-300 tabular-nums w-5">{idx + 1}.</span>
                  <ArrowRight size={10} className="text-cyan-300/60" />
                  <span className="text-[11px] font-medium w-20 truncate">{ACTION_KINDS.find((k) => k.kind === a.kind)?.label ?? a.kind}</span>
                  <input
                    value={
                      a.kind === 'tag' || a.kind === 'untag'
                        ? a.args?.tag ?? ''
                        : a.kind === 'rename'
                          ? a.args?.template ?? ''
                          : a.kind === 'transcode'
                            ? a.args?.preset ?? ''
                            : a.kind === 'move'
                              ? a.args?.dstDir ?? ''
                              : a.kind === 'rate'
                                ? String(a.args?.value ?? 0)
                                : a.kind === 'addToPlaylist'
                                  ? a.args?.playlistName ?? ''
                                  : ''
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      const args: any = a.kind === 'tag' || a.kind === 'untag'
                        ? { tag: v }
                        : a.kind === 'rename'
                          ? { template: v }
                          : a.kind === 'transcode'
                            ? { preset: v }
                            : a.kind === 'move'
                              ? { dstDir: v }
                              : a.kind === 'rate'
                                ? { value: Math.max(0, Math.min(5, Number(v) || 0)) }
                                : a.kind === 'addToPlaylist'
                                  ? { playlistName: v }
                                  : {}
                      updateActionArg(idx, args)
                    }}
                    placeholder={
                      a.kind === 'tag' || a.kind === 'untag' ? 'tag name'
                      : a.kind === 'rename' ? '{date:YYYY-MM-DD}_{title}'
                      : a.kind === 'transcode' ? 'h264-1080p'
                      : a.kind === 'move' ? 'C:\\dst'
                      : a.kind === 'rate' ? '0-5'
                      : a.kind === 'addToPlaylist' ? 'playlist name'
                      : ''
                    }
                    className="flex-1 px-2 py-1 rounded bg-black/30 border border-white/10 text-[10px] font-mono outline-none focus:border-cyan-500/50"
                  />
                  <button
                    onClick={() => removeAction(idx)}
                    className="text-[var(--muted)] hover:text-red-300"
                    aria-label="Remove"
                  >
                    <Trash2 size={11} />
                  </button>
                </motion.div>
              ))}
              <details className="text-[10px]">
                <summary className="cursor-pointer text-cyan-300/80 hover:text-cyan-200 flex items-center gap-1 py-1">
                  <Plus size={11} /> Add action <ChevronDown size={10} />
                </summary>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {ACTION_KINDS.map((ak) => (
                    <button
                      key={ak.kind}
                      onClick={() => addAction(ak.kind)}
                      className="text-left px-2 py-1 rounded bg-white/5 hover:bg-cyan-500/10 hover:text-cyan-200 text-[11px] transition"
                    >
                      <Tag size={9} className="inline mr-1" />
                      {ak.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>

            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                className="accent-cyan-500"
              />
              <span>Enabled (apply on new files)</span>
            </label>

            <NetworkActionRow>
              <NetworkPrimaryBtn
                onClick={onSave}
                disabled={busy || !editing.name.trim() || !editing.folderPath.trim()}
                accent="bg-cyan-600/30 hover:bg-cyan-600/40 text-cyan-100"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save preset
              </NetworkPrimaryBtn>
            </NetworkActionRow>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}
