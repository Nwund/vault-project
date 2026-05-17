// File: src/renderer/components/ProfileSwitcher.tsx
//
// #195 — User profile switcher dropdown. Surfaces the active profile
// + lets the user create/rename/delete + switch between profiles.
// Triggers a vault:changed broadcast on switch so watch-history reads
// re-fetch with the new profile filter applied.
//
// Mounts in the title bar / top toolbar — small avatar circle + name
// that expands into a popover on click.

import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, User, Plus, Pencil, Trash2, Check, X as XIcon } from 'lucide-react'

interface Profile {
  id: string
  name: string
  color: string | null
  avatarPath: string | null
  createdAt: number
  updatedAt: number
}

const DEFAULT_COLORS = ['#7c3aed', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function pickColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length]
}

export function ProfileSwitcher({ className }: { className?: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState<string>('default')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    const api: any = (window as any).api
    if (!api?.userProfilesList) return
    try {
      const res = await api.userProfilesList()
      if (res?.ok) {
        setProfiles(res.profiles ?? [])
        setActiveId(res.activeId ?? 'default')
      }
    } catch { /* IPC missing */ }
  }, [])

  useEffect(() => {
    void refresh()
    const api: any = (window as any).api
    const off = api?.events?.onVaultChanged?.(() => { void refresh() })
    return () => { try { off?.() } catch {} }
  }, [refresh])

  const switchTo = useCallback(async (id: string) => {
    if (id === activeId) { setOpen(false); return }
    const api: any = (window as any).api
    try {
      await api.userProfilesSetActive(id)
      setActiveId(id)
      setOpen(false)
    } catch { /* noop */ }
  }, [activeId])

  const createProfile = useCallback(async () => {
    if (!draftName.trim()) return
    const api: any = (window as any).api
    try {
      await api.userProfilesCreate({ name: draftName.trim(), color: pickColor(draftName) })
      setCreating(false)
      setDraftName('')
      await refresh()
    } catch { /* noop */ }
  }, [draftName, refresh])

  const renameProfile = useCallback(async (id: string) => {
    if (!draftName.trim()) { setEditingId(null); return }
    const api: any = (window as any).api
    try {
      await api.userProfilesUpdate(id, { name: draftName.trim() })
      setEditingId(null)
      setDraftName('')
      await refresh()
    } catch { /* noop */ }
  }, [draftName, refresh])

  const deleteProfile = useCallback(async (id: string) => {
    if (id === 'default') return
    if (!confirm('Delete this profile? Its watch history is reassigned to the default profile.')) return
    const api: any = (window as any).api
    try {
      await api.userProfilesDelete(id)
      await refresh()
    } catch { /* noop */ }
  }, [refresh])

  const active = profiles.find((p) => p.id === activeId)
  const activeColor = active?.color ?? pickColor(active?.name ?? 'Default')
  const initial = (active?.name ?? 'D').charAt(0).toUpperCase()

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition"
        title={`Active profile: ${active?.name ?? 'Default'}`}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white"
          style={{ background: activeColor }}
        >
          {initial}
        </div>
        <span className="text-xs text-white/80 max-w-[8rem] truncate hidden md:inline">
          {active?.name ?? 'Default'}
        </span>
        <ChevronDown size={12} className="text-white/40" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 z-[101] rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
              Profiles
            </div>
            <div className="max-h-80 overflow-y-auto">
              {profiles.map((p) => {
                const isActive = p.id === activeId
                const isEditing = editingId === p.id
                const c = p.color ?? pickColor(p.name)
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 px-3 py-2 transition ${
                      isActive ? 'bg-[var(--primary)]/15' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{ background: c }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void renameProfile(p.id)
                          if (e.key === 'Escape') { setEditingId(null); setDraftName('') }
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-sm outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => switchTo(p.id)}
                        className="flex-1 text-left text-sm truncate"
                      >
                        {p.name}
                      </button>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => renameProfile(p.id)}
                            className="p-1 rounded hover:bg-white/10 text-emerald-400"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setDraftName('') }}
                            className="p-1 rounded hover:bg-white/10 text-zinc-500"
                          >
                            <XIcon size={12} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingId(p.id); setDraftName(p.name) }}
                            className="p-1 rounded hover:bg-white/10 text-zinc-400 opacity-0 group-hover:opacity-100"
                            title="Rename"
                          >
                            <Pencil size={11} />
                          </button>
                          {p.id !== 'default' && (
                            <button
                              onClick={() => deleteProfile(p.id)}
                              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-red-300"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-zinc-800">
              {creating ? (
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <User size={14} className="text-zinc-500 shrink-0" />
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createProfile()
                      if (e.key === 'Escape') { setCreating(false); setDraftName('') }
                    }}
                    placeholder="Profile name…"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-sm outline-none"
                  />
                  <button
                    onClick={createProfile}
                    className="p-1 rounded text-emerald-400 hover:bg-white/10"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => { setCreating(false); setDraftName('') }}
                    className="p-1 rounded text-zinc-500 hover:bg-white/10"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition text-sm text-zinc-300"
                >
                  <Plus size={12} />
                  New profile
                </button>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-500">
              Profiles share media + tags, but each has its own watch history.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
