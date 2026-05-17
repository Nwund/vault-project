'use memo'
// File: src/renderer/components/BacklinksPanel.tsx
//
// Obsidian-style backlinks for a media item (#297).
// Shows references from playlists, performers, studios, platforms,
// wikilinks in notes, bookmarks — anything that ties this item into
// the rest of the library. Lives inside MediaInfoModal and any other
// "media detail" surface that wants the same context.

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link2, ListMusic, Users, Tag as TagIcon, Bookmark, Globe, Loader2 } from 'lucide-react'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'

interface BackRef {
  mediaId: string
  filename: string | null
  thumbPath: string | null
  source: string
  detail: string
  score: number
}

const SOURCE_ICON: Record<string, typeof Link2> = {
  playlist: ListMusic,
  performer: Users,
  studio: TagIcon,
  platform: Globe,
  wikilink: Link2,
  bookmark: Bookmark,
  tag: TagIcon,
}

const SOURCE_COLOR: Record<string, string> = {
  playlist: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  performer: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  studio: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  platform: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  wikilink: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  bookmark: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  tag: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
}

export function BacklinksPanel({
  mediaId,
  limit = 20,
  onOpenMedia,
}: {
  mediaId: string
  limit?: number
  onOpenMedia?: (id: string) => void
}) {
  const [refs, setRefs] = useState<BackRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.backlinks?.find?.(mediaId, limit)
      if (res?.refs) setRefs(res.refs)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [mediaId, limit])

  useEffect(() => { refresh() }, [refresh])

  // Group by source for a tidier display
  const grouped = refs.reduce<Record<string, BackRef[]>>((acc, ref) => {
    (acc[ref.source] ||= []).push(ref)
    return acc
  }, {})

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] uppercase tracking-wide">
          <Link2 size={12} />
          Backlinks
          {!loading && <span className="text-[10px] normal-case tracking-normal text-zinc-500">· {refs.length}</span>}
        </div>
        {loading && <Loader2 size={12} className="animate-spin text-[var(--muted)]" />}
      </div>

      {error && (
        <div className="text-[11px] text-red-300 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      {!loading && refs.length === 0 && !error && (
        <div className="text-[11px] text-[var(--muted)] italic px-1 py-2">
          No backlinks yet. Add this item to a playlist, tag it with <code className="text-[10px]">performer:</code> /
          <code className="text-[10px]">studio:</code> /
          <code className="text-[10px]">platform:</code>, or reference it from a note via
          <code className="text-[10px]"> [[wikilink]]</code>.
        </div>
      )}

      <AnimatePresence>
        {Object.entries(grouped).map(([source, items]) => {
          const Icon = SOURCE_ICON[source] ?? Link2
          const color = SOURCE_COLOR[source] ?? 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
          return (
            <motion.div
              key={source}
              {...FADE_SLIDE}
              className="space-y-1"
            >
              <div className="flex items-center gap-1.5 px-1">
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wider ${color}`}>
                  <Icon size={10} />
                  {source}
                </span>
                <span className="text-[10px] text-zinc-500">{items.length}</span>
              </div>
              <div className="space-y-1">
                {items.map((r) => (
                  <motion.button
                    key={`${r.mediaId}-${r.detail}`}
                    layout
                    transition={SPRINGS.snappy}
                    onClick={() => onOpenMedia?.(r.mediaId)}
                    className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition text-left group"
                  >
                    {r.thumbPath ? (
                      <img
                        src={`vault://thumb/${encodeURIComponent(r.thumbPath)}`}
                        alt=""
                        className="size-9 rounded object-cover bg-black/30 flex-shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="size-9 rounded bg-black/30 flex-shrink-0 grid place-items-center">
                        <Icon size={12} className="text-zinc-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate group-hover:text-white">
                        {r.filename ?? 'untitled'}
                      </div>
                      <div className="text-[10px] text-[var(--muted)] truncate">
                        {r.detail}
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 tabular-nums">
                      {(r.score * 100).toFixed(0)}%
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
