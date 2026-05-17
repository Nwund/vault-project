'use memo'
// File: src/renderer/components/network/YtdlpProfilesCard.tsx
//
// #307 E-83 — yt-dlp postprocessor profile editor. Manages saved
// argsArray profiles for the URL downloader. Built-in profiles are
// shown read-only with a star indicator; user can mark any profile as
// the default for new downloads.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Download,
  Loader2,
  Plus,
  Trash2,
  Save,
  Star,
  Lock,
  X,
} from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

interface Profile {
  id: string
  name: string
  argsArray: string[]
  isBuiltin?: boolean
}

const EMPTY: Profile = { id: '', name: 'New profile', argsArray: [] }

export function YtdlpProfilesCard() {
  const { showToast } = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editing, setEditing] = useState<Profile | null>(null)
  const [argsRaw, setArgsRaw] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await window.api.tags.ytdlpProfiles.list()
      if (res.ok) setProfiles(res.profiles ?? [])
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : profiles.length > 0
        ? 'running'
        : 'idle'

  const onSave = useCallback(async () => {
    if (!editing) return
    const argsArray = argsRaw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.ytdlpProfiles.save({
        id: editing.id || undefined,
        name: editing.name.trim() || 'Untitled',
        argsArray,
        isDefault: makeDefault,
      })
      if (!res.ok) throw new Error(res.error ?? 'Save failed')
      showToast?.('success', `Saved profile "${editing.name.trim()}"`)
      setEditing(null)
      refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [editing, argsRaw, makeDefault, refresh, showToast])

  const onDelete = useCallback(async (p: Profile) => {
    if (p.isBuiltin) return
    await window.api.tags.ytdlpProfiles.delete(p.id)
    refresh()
    if (editing?.id === p.id) setEditing(null)
  }, [refresh, editing])

  const onSetDefault = useCallback(async (p: Profile) => {
    await window.api.tags.ytdlpProfiles.setDefault(p.id)
    showToast?.('success', `${p.name} is now default`)
  }, [showToast])

  const beginEdit = useCallback((p: Profile) => {
    setEditing(p)
    setArgsRaw(p.argsArray.join(' '))
    setMakeDefault(false)
  }, [])

  return (
    <NetworkServiceCard
      Icon={Download}
      title="yt-dlp profiles"
      description="Saved argsArray presets for the URL downloader. Built-in profiles are read-only; create custom ones for specific sites or quality targets."
      state={state}
      statusLabel={profiles.length > 0 ? `${profiles.length} profile${profiles.length === 1 ? '' : 's'}` : undefined}
      accent="from-slate-500 to-zinc-600"
      error={error}
    >
      <div className="space-y-1">
        {profiles.map((p) => (
          <motion.div
            key={p.id}
            layout
            transition={SPRINGS.snappy}
            className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5"
          >
            <span className="text-sm flex-1 truncate flex items-center gap-1.5">
              {p.isBuiltin && <Lock size={10} className="text-zinc-500" />}
              {p.name}
            </span>
            <span className="text-[10px] text-zinc-500 tabular-nums">
              {p.argsArray.length} arg{p.argsArray.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => onSetDefault(p)}
              className="text-[var(--muted)] hover:text-amber-300 transition"
              aria-label="Set default"
            >
              <Star size={12} />
            </button>
            <button
              onClick={() => beginEdit(p)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white"
            >
              {p.isBuiltin ? 'View' : 'Edit'}
            </button>
            {!p.isBuiltin && (
              <button
                onClick={() => onDelete(p)}
                className="text-[var(--muted)] hover:text-red-300 transition"
                aria-label="Delete"
              >
                <Trash2 size={12} />
              </button>
            )}
          </motion.div>
        ))}
      </div>

      <NetworkActionRow>
        <NetworkGhostBtn onClick={() => { setEditing(EMPTY); setArgsRaw(''); setMakeDefault(false) }}>
          <Plus size={14} /> New profile
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {editing && (
          <motion.div
            {...FADE_SLIDE}
            className="rounded-2xl bg-zinc-700/10 border border-white/10 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                {editing.id ? (editing.isBuiltin ? 'View profile (built-in)' : 'Edit profile') : 'New profile'}
              </span>
              <button onClick={() => setEditing(null)} className="text-[var(--muted)] hover:text-white">
                <X size={12} />
              </button>
            </div>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              disabled={editing.isBuiltin}
              placeholder="Profile name"
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50 disabled:opacity-60"
            />
            <label className="space-y-1 block">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                argsArray (whitespace-separated)
              </span>
              <textarea
                value={argsRaw}
                onChange={(e) => setArgsRaw(e.target.value)}
                disabled={editing.isBuiltin}
                rows={3}
                placeholder="-f bestvideo[height<=1080]+bestaudio --merge-output-format mp4"
                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50 resize-none disabled:opacity-60"
              />
            </label>
            {!editing.isBuiltin && (
              <>
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={makeDefault}
                    onChange={(e) => setMakeDefault(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Set as default for new downloads
                </label>
                <NetworkActionRow>
                  <NetworkPrimaryBtn
                    onClick={onSave}
                    disabled={busy || !editing.name.trim()}
                    accent="bg-zinc-700/40 hover:bg-zinc-700/60 text-zinc-100"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </NetworkPrimaryBtn>
                </NetworkActionRow>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}
