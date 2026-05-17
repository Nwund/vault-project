'use memo'
// File: src/renderer/components/network/CaptionPoolCard.tsx
//
// #365 H-141 — Caption overlay pool editor. Stores categorized lists of
// captions that the player can overlay on a configurable interval. UI
// surface for `tags.captionPool.*`.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessagesSquare, Plus, Trash2, Save, Loader2 } from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

const FONT_CHOICES = [
  'Inter', 'Bangers', 'Anton', 'Bowlby One', 'Pacifico', 'Sacramento', 'Cinzel',
  'Black Ops One', 'Faster One', 'Audiowide', 'VT323', 'Bungee', 'Bungee Spice',
]

export function CaptionPoolCard() {
  const { showToast } = useToast()
  const [pools, setPools] = useState<Record<string, string[]>>({})
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [intervalSec, setIntervalSec] = useState(4)
  const [fontFamily, setFontFamily] = useState('Bangers')
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCaptionText, setNewCaptionText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await window.api.tags.captionPool.list()
      if (res.ok) {
        setPools(res.pools ?? {})
        setActiveCategories(res.activeCategories ?? [])
        setIntervalSec(res.intervalSec ?? 4)
        setFontFamily(res.fontFamily ?? 'Bangers')
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const totalCaptions = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : activeCategories.length > 0
        ? 'running'
        : totalCaptions > 0
          ? 'idle'
          : 'idle'

  const onSave = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await window.api.tags.captionPool.save({
        pools,
        intervalSec,
        fontFamily,
        activeCategories,
      })
      if (!res.ok) throw new Error(res.error ?? 'Save failed')
      showToast?.('success', 'Caption pool saved')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [pools, intervalSec, fontFamily, activeCategories, showToast])

  const addCategory = useCallback(() => {
    if (!newCategoryName.trim()) return
    const name = newCategoryName.trim()
    if (pools[name]) return
    setPools({ ...pools, [name]: [] })
    setEditingCategory(name)
    setNewCategoryName('')
  }, [newCategoryName, pools])

  const deleteCategory = useCallback((name: string) => {
    const next = { ...pools }
    delete next[name]
    setPools(next)
    setActiveCategories((prev) => prev.filter((c) => c !== name))
    if (editingCategory === name) setEditingCategory(null)
  }, [pools, editingCategory])

  const addCaption = useCallback(() => {
    if (!editingCategory || !newCaptionText.trim()) return
    setPools({
      ...pools,
      [editingCategory]: [...(pools[editingCategory] ?? []), newCaptionText.trim()],
    })
    setNewCaptionText('')
  }, [editingCategory, newCaptionText, pools])

  const removeCaption = useCallback((cat: string, idx: number) => {
    setPools({
      ...pools,
      [cat]: pools[cat].filter((_, i) => i !== idx),
    })
  }, [pools])

  const toggleActive = useCallback((cat: string) => {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }, [])

  return (
    <NetworkServiceCard
      Icon={MessagesSquare}
      title="Caption overlay pool"
      description="Categorized captions that the player overlays at a configurable interval. Toggle which categories are active to control what shows during playback."
      state={state}
      statusLabel={activeCategories.length > 0 ? `${activeCategories.length} active` : totalCaptions > 0 ? `${totalCaptions} captions` : undefined}
      accent="from-fuchsia-500 to-pink-500"
      error={error}
    >
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Interval (s)</span>
          <input
            type="number"
            min={1}
            max={60}
            value={intervalSec}
            onChange={(e) => setIntervalSec(Math.max(1, Number(e.target.value) || 4))}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Font family</span>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
            style={{ fontFamily }}
          >
            {FONT_CHOICES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Categories */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Categories</div>
        {Object.keys(pools).length === 0 && (
          <div className="text-[11px] text-[var(--muted)] italic px-1">
            No caption categories yet. Add one below.
          </div>
        )}
        {Object.entries(pools).map(([cat, captions]) => {
          const active = activeCategories.includes(cat)
          return (
            <motion.div
              key={cat}
              layout
              transition={SPRINGS.snappy}
              className={`rounded-lg border ${
                editingCategory === cat
                  ? 'bg-fuchsia-500/10 border-fuchsia-500/30'
                  : 'bg-white/[0.03] border-white/5'
              }`}
            >
              <div className="flex items-center gap-2 p-2">
                <button
                  onClick={() => toggleActive(cat)}
                  className={`size-3 rounded-full transition ${
                    active ? 'bg-fuchsia-400 ring-1 ring-fuchsia-400/50' : 'bg-zinc-700'
                  }`}
                  title={active ? 'Click to deactivate' : 'Click to activate'}
                />
                <span className="text-sm flex-1 truncate">{cat}</span>
                <span className="text-[10px] text-fuchsia-300 tabular-nums">{captions.length}</span>
                <button
                  onClick={() => setEditingCategory(editingCategory === cat ? null : cat)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white"
                >
                  {editingCategory === cat ? 'Done' : 'Edit'}
                </button>
                <button
                  onClick={() => deleteCategory(cat)}
                  className="text-[var(--muted)] hover:text-red-300 transition"
                  aria-label="Delete category"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <AnimatePresence>
                {editingCategory === cat && (
                  <motion.div
                    {...FADE_SLIDE}
                    className="px-2 pb-2 space-y-1 border-t border-white/5"
                  >
                    <div className="space-y-0.5 max-h-32 overflow-y-auto pt-2 pr-1">
                      {captions.map((c, i) => (
                        <motion.div
                          key={`${cat}-${i}`}
                          layout
                          transition={SPRINGS.snappy}
                          className="flex items-center gap-2 p-1 rounded bg-white/[0.03]"
                        >
                          <span className="text-[10px] text-fuchsia-300 tabular-nums w-5">{i + 1}</span>
                          <span className="text-[11px] flex-1 truncate" style={{ fontFamily }}>{c}</span>
                          <button
                            onClick={() => removeCaption(cat, i)}
                            className="text-[var(--muted)] hover:text-red-300 transition"
                          >
                            <Trash2 size={10} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <input
                        value={newCaptionText}
                        onChange={(e) => setNewCaptionText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCaption() }}
                        placeholder="Add caption…"
                        className="flex-1 px-2 py-1 rounded bg-black/30 border border-white/10 text-[11px] outline-none focus:border-fuchsia-500/50"
                      />
                      <button
                        onClick={addCaption}
                        disabled={!newCaptionText.trim()}
                        className="px-2 py-1 rounded bg-fuchsia-600/30 hover:bg-fuchsia-600/40 text-fuchsia-100 text-[11px] transition disabled:opacity-50"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      <div className="flex gap-1">
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
          placeholder="New category name…"
          className="flex-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-fuchsia-500/50"
        />
        <NetworkGhostBtn onClick={addCategory} disabled={!newCategoryName.trim()}>
          <Plus size={14} /> Category
        </NetworkGhostBtn>
      </div>

      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onSave}
          disabled={busy}
          accent="bg-fuchsia-600/30 hover:bg-fuchsia-600/40 text-fuchsia-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save pool
        </NetworkPrimaryBtn>
      </NetworkActionRow>
    </NetworkServiceCard>
  )
}
