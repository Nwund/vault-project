// File: src/renderer/components/sessions/HistoryView.tsx
//
// Session history. Three panels:
//
//   1. Orgasm budget ledger (6-month trailing history with bar chart).
//   2. Edging recent sessions (last 20 with XP earned + duration).
//   3. Monthly recap card (top tags, top media, headline).

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { SPRINGS } from '../network/motion-tokens'
import { Calendar, BarChart3, Sparkles, TrendingUp, Flame } from 'lucide-react'

interface BudgetHistoryRow { monthStart: number; monthLabel: string; climaxes: number; ruined: number; relapses: number }
interface EdgingSession { id?: string; startTs?: number; endTs?: number; durationMs?: number; xp?: number; outcome?: string }

export function HistoryView() {
  return (
    <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BudgetLedger />
      <RecapCard />
      <EdgingHistory />
    </div>
  )
}

// ── Budget ledger ─────────────────────────────────────────────────────────

function BudgetLedger() {
  const [rows, setRows] = useState<BudgetHistoryRow[]>([])
  const [budgetLimit, setBudgetLimit] = useState<number>(0)
  const [newLimit, setNewLimit] = useState<string>('')

  const refresh = async () => {
    const [h, s] = await Promise.all([
      window.api.budget.history(6),
      window.api.budget.status(),
    ])
    if (h.ok && h.history) setRows(h.history as any)
    if (s.ok && s.status) setBudgetLimit(s.status.budget)
  }
  useEffect(() => { refresh() }, [])

  const updateLimit = async () => {
    const n = Number(newLimit)
    if (!Number.isFinite(n) || n < 0) return
    await window.api.budget.setLimit(n)
    setNewLimit('')
    refresh()
  }

  const maxCount = Math.max(1, ...rows.map((r) => r.climaxes + r.ruined))

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center text-white shadow-lg">
            <Calendar size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Orgasm budget ledger</h3>
            <p className="text-[10px] text-zinc-500">6-month trailing history</p>
          </div>
        </div>

        {/* Limit row */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Monthly limit:</span>
          <span className="text-lg font-bold tabular-nums text-amber-300">{budgetLimit}</span>
          <span className="text-[10px] text-zinc-500">per month</span>
          <input
            type="number"
            value={newLimit}
            placeholder="set new"
            onChange={(e) => setNewLimit(e.target.value)}
            className="ml-auto w-20 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-[11px]"
          />
          <button onClick={updateLimit} className="text-[11px] text-amber-300 hover:text-amber-100 underline">Save</button>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-2 h-32 mb-3 px-1">
          {rows.length === 0 ? (
            <div className="m-auto text-[11px] text-zinc-500">No history yet.</div>
          ) : rows.slice().reverse().map((row) => {
            const totalH = ((row.climaxes + row.ruined) / maxCount) * 100
            const climaxH = (row.climaxes / Math.max(1, row.climaxes + row.ruined)) * totalH
            const ruinedH = totalH - climaxH
            return (
              <div key={row.monthStart} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex flex-col-reverse gap-0.5">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${climaxH}%` }}
                    transition={SPRINGS.soft}
                    className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-sm"
                    title={`${row.climaxes} climax`}
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${ruinedH}%` }}
                    transition={{ ...SPRINGS.soft, delay: 0.05 }}
                    className="w-full bg-gradient-to-t from-zinc-700 to-zinc-600 rounded-t-sm"
                    title={`${row.ruined} ruined`}
                  />
                </div>
                <span className="text-[9px] text-zinc-500 truncate w-full text-center">{row.monthLabel}</span>
                <span className="text-[10px] font-bold tabular-nums">{row.climaxes}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-400" />Climax</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-zinc-600" />Ruined</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Recap card ────────────────────────────────────────────────────────────

function RecapCard() {
  const [recap, setRecap] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<'monthly' | 'halfYear' | 'yearly'>('monthly')

  const refresh = async () => {
    setLoading(true)
    try {
      const fn = period === 'monthly'
        ? window.api.recap.monthly
        : period === 'halfYear'
          ? window.api.recap.halfYear
          : window.api.recap.yearly
      const r = await fn({})
      if (r.ok && r.recap) setRecap(r.recap)
    } catch (err) {
      console.warn('[recap]', err)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [period])

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center text-white shadow-lg">
            <Sparkles size={16} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold tracking-tight">Recap</h3>
            <p className="text-[10px] text-zinc-500">Auto-summarized highlights</p>
          </div>
          <div className="flex bg-black/30 rounded-lg border border-white/5 p-0.5">
            {(['monthly', 'halfYear', 'yearly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`relative px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${period === p ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {period === p && (
                  <motion.div
                    layoutId="recap-period-pill"
                    className="absolute inset-0 rounded-md bg-emerald-500/30 -z-10"
                    transition={SPRINGS.snappy}
                  />
                )}
                {p === 'halfYear' ? '6mo' : p === 'monthly' ? '30d' : '365d'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-[11px] text-zinc-500">Computing…</div>
        ) : recap ? (
          <motion.div
            key={JSON.stringify(recap).slice(0, 32)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {recap.headline && (
              <p className="text-base font-medium text-emerald-200 leading-snug">{recap.headline}</p>
            )}
            {Array.isArray(recap.topTags) && recap.topTags.length > 0 && (
              <Section title="Top tags">
                <div className="flex flex-wrap gap-1.5">
                  {recap.topTags.slice(0, 8).map((t: any, i: number) => (
                    <motion.span
                      key={t.tag ?? i}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
                    >
                      {t.tag ?? t} <span className="text-emerald-400/70 tabular-nums">{t.count ?? ''}</span>
                    </motion.span>
                  ))}
                </div>
              </Section>
            )}
            {Array.isArray(recap.topPerformers) && recap.topPerformers.length > 0 && (
              <Section title="Top performers">
                <div className="flex flex-wrap gap-1.5">
                  {recap.topPerformers.slice(0, 6).map((p: any, i: number) => (
                    <span key={p.name ?? i} className="px-2 py-0.5 rounded-full text-[10px] bg-pink-500/15 border border-pink-500/30 text-pink-200">
                      {p.name ?? p}
                    </span>
                  ))}
                </div>
              </Section>
            )}
            {recap.totalDurationHours != null && (
              <Section title="Total watched">
                <span className="text-2xl font-bold tabular-nums text-emerald-200">{Math.round(recap.totalDurationHours)}<span className="text-sm font-normal text-zinc-400 ml-1">hours</span></span>
              </Section>
            )}
          </motion.div>
        ) : (
          <div className="text-[11px] text-zinc-500">No recap available yet.</div>
        )}
      </div>
    </motion.div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1.5">{title}</div>
      {children}
    </div>
  )
}

// ── Edging history list ────────────────────────────────────────────────────

function EdgingHistory() {
  const [sessions, setSessions] = useState<EdgingSession[]>([])

  const refresh = async () => {
    const r = await window.api.edging.recent(20)
    if (r.ok && r.sessions) setSessions(r.sessions as any)
  }
  useEffect(() => { refresh() }, [])

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30 lg:col-span-2"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 to-pink-600" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 grid place-items-center text-white shadow-lg">
            <TrendingUp size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Edging sessions</h3>
            <p className="text-[10px] text-zinc-500">Last 20</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-[11px] text-zinc-500 py-8 text-center">No sessions yet.</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((s, i) => (
              <motion.div
                key={s.id ?? i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.015 }}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-2 rounded-lg bg-black/20 border border-white/5 hover:border-white/15 transition"
              >
                <div className="text-[11px] text-zinc-300 truncate">
                  {s.startTs ? new Date(s.startTs).toLocaleString() : '—'}
                </div>
                <div className="text-[11px] tabular-nums text-zinc-400">
                  {s.durationMs ? formatDuration(s.durationMs) : '—'}
                </div>
                <div className="text-[11px] text-violet-300 tabular-nums">+{s.xp ?? 0} XP</div>
                <OutcomeChip outcome={s.outcome ?? 'unknown'} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function OutcomeChip({ outcome }: { outcome: string }) {
  const map: Record<string, string> = {
    climax: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    denied: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    ruined: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
    unknown: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
  }
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${map[outcome] ?? map.unknown}`}>{outcome}</span>
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
