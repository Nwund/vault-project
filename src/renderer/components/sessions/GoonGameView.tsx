// File: src/renderer/components/sessions/GoonGameView.tsx
//
// Roguelike-style "goon game" tab — the player picks one of three
// encounter cards per floor, advancing through 4–8 floors to a
// procedurally-selected boss persona. Tracks personal bests in
// localStorage; pure renderer logic.

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SPRINGS } from '../network/motion-tokens'
import {
  Gamepad2, Flame, Crown, RotateCcw, Trophy, Heart,
  Zap, Clock, Star, Skull,
} from 'lucide-react'
import { Btn } from '../ui/Btn'
import {
  startRun, chooseCard, loadPBs, recordRun,
  type GameState, type Encounter, type PersonalBests,
} from '../../utils/goon-game'

const BOSS_META: Record<GameState['boss'], { label: string; emoji: string; accent: string }> = {
  mistress: { label: 'Mistress', emoji: '👑', accent: 'from-red-600 to-rose-700' },
  stepsister: { label: 'Stepsister', emoji: '😈', accent: 'from-purple-500 to-violet-600' },
  cheerleader: { label: 'Cheerleader', emoji: '🎀', accent: 'from-yellow-400 to-amber-500' },
  boss: { label: 'Boss', emoji: '💼', accent: 'from-slate-500 to-zinc-700' },
  goonbud: { label: 'Goon Bud', emoji: '🤝', accent: 'from-fuchsia-500 to-pink-500' },
}

const ENCOUNTER_META: Record<Encounter['kind'], { Icon: typeof Heart; color: string }> = {
  watch:  { Icon: Flame, color: 'from-rose-500 to-pink-600' },
  edge:   { Icon: Zap, color: 'from-amber-500 to-orange-600' },
  joi:    { Icon: Crown, color: 'from-violet-500 to-purple-600' },
  task:   { Icon: RotateCcw, color: 'from-cyan-500 to-blue-600' },
  debuff: { Icon: Skull, color: 'from-zinc-500 to-zinc-700' },
  buff:   { Icon: Star, color: 'from-emerald-500 to-teal-600' },
}

export function GoonGameView() {
  const [state, setState] = useState<GameState | null>(null)
  const [pbs, setPbs] = useState<PersonalBests>(() => loadPBs())

  useEffect(() => {
    if (state && (state.status === 'won' || state.status === 'lost')) {
      setPbs(recordRun(state))
    }
  }, [state?.status])

  const begin = () => setState(startRun())
  const pick = (i: number) => setState((s) => s ? chooseCard(s, i) : s)
  const reset = () => setState(null)

  return (
    <div className="px-6 py-5 max-w-6xl mx-auto">
      {!state ? (
        <StartScreen pbs={pbs} onStart={begin} />
      ) : state.status === 'in-progress' ? (
        <RunInProgress state={state} onPick={pick} onAbandon={reset} />
      ) : (
        <RunEnded state={state} pbs={pbs} onAgain={begin} onHome={reset} />
      )}
    </div>
  )
}

// ── Pre-run lobby ──────────────────────────────────────────────────────────

function StartScreen({ pbs, onStart }: { pbs: PersonalBests; onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={SPRINGS.standard}
            className="size-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 grid place-items-center shadow-2xl shadow-violet-500/30"
          >
            <Gamepad2 size={26} className="text-white" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Goon Game</h2>
            <p className="text-xs text-zinc-400">A short, procedural session-run. 4–8 floors → boss.</p>
          </div>
        </div>
        <ul className="space-y-2 text-[12px] text-zinc-300">
          <li className="flex gap-2"><Flame size={14} className="text-rose-400 shrink-0 mt-0.5" />Each floor offers 3 cards — pick one.</li>
          <li className="flex gap-2"><Zap size={14} className="text-amber-400 shrink-0 mt-0.5" />Stamina depletes. Reach 0 and you lose.</li>
          <li className="flex gap-2"><Crown size={14} className="text-violet-400 shrink-0 mt-0.5" />Survive to the final floor to face the boss persona.</li>
        </ul>
        <div className="pt-2">
          <Btn tone="primary" onClick={onStart} className="!text-sm !px-5 !py-3">Begin Run</Btn>
        </div>
      </div>
      <PBPanel pbs={pbs} />
    </motion.div>
  )
}

function PBPanel({ pbs }: { pbs: PersonalBests }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-amber-400" />
        <h3 className="text-sm font-semibold tracking-tight">Personal bests</h3>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <PBStat label="Runs" value={String(pbs.runsCompleted)} accent="text-zinc-100" />
        <PBStat label="Best floor" value={String(pbs.bestFloor)} accent="text-amber-300" />
        <PBStat label="Best XP" value={String(pbs.bestXp)} accent="text-violet-300" />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Bosses defeated</div>
      <div className="grid grid-cols-5 gap-2">
        {(Object.keys(BOSS_META) as Array<keyof typeof BOSS_META>).map((b) => {
          const count = pbs.bossesDefeated[b] ?? 0
          return (
            <div key={b} className={`rounded-xl border ${count > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-white/5 bg-black/20'} p-2 text-center`}>
              <div className="text-2xl">{BOSS_META[b].emoji}</div>
              <div className="text-[9px] text-zinc-400 mt-1">{BOSS_META[b].label}</div>
              <div className={`text-[11px] font-bold tabular-nums ${count > 0 ? 'text-amber-300' : 'text-zinc-500'}`}>{count}×</div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function PBStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-black/30 border border-white/5 p-3">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
  )
}

// ── In-progress run ────────────────────────────────────────────────────────

function RunInProgress({ state, onPick, onAbandon }: { state: GameState; onPick: (i: number) => void; onAbandon: () => void }) {
  const bossMeta = BOSS_META[state.boss]
  const isFinalFloor = state.floor === state.maxFloor
  return (
    <div className="space-y-5">
      {/* HUD */}
      <motion.div
        layout
        className="grid grid-cols-4 gap-3 rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl p-4"
      >
        <HudStat Icon={Clock} label="Floor" value={`${state.floor}/${state.maxFloor}`} accent="from-blue-500 to-cyan-500" />
        <HudStat Icon={Heart} label="Stamina" value={`${state.stamina}`} accent="from-rose-500 to-pink-600" />
        <HudStat Icon={Star} label="XP" value={`${state.xp}`} accent="from-violet-500 to-purple-600" />
        <div className="rounded-xl bg-black/30 border border-white/5 p-3 flex items-center gap-3">
          <div className="text-2xl">{bossMeta.emoji}</div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-zinc-500">Final boss</div>
            <div className="text-sm font-semibold truncate">{bossMeta.label}</div>
          </div>
        </div>
      </motion.div>

      {/* Floor banner */}
      <motion.div
        key={state.floor}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <h3 className="text-xl font-bold tracking-tight">
          {isFinalFloor ? `Final Floor · ${bossMeta.label} awaits` : `Floor ${state.floor}`}
        </h3>
        <button onClick={onAbandon} className="text-[11px] text-zinc-500 hover:text-rose-400 underline">Abandon run</button>
      </motion.div>

      {/* Card hand */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {state.hand.map((card, i) => (
            <EncounterCard key={`${state.floor}-${i}`} card={card} index={i} onPick={() => onPick(i)} />
          ))}
        </AnimatePresence>
      </div>

      {/* History */}
      {state.history.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Path taken</div>
          <div className="flex gap-1.5 flex-wrap">
            {state.history.map((h, i) => {
              const meta = ENCOUNTER_META[h.kind]
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className={`px-2 py-0.5 rounded-full text-[10px] bg-gradient-to-r ${meta.color} text-white/90`}
                  title={h.label}
                >
                  <meta.Icon size={10} className="inline mr-1" />
                  {h.kind}
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function HudStat({ Icon, label, value, accent }: { Icon: typeof Heart; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-black/30 border border-white/5 p-3 flex items-center gap-3">
      <div className={`size-9 rounded-xl bg-gradient-to-br ${accent} grid place-items-center text-white`}>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
        <motion.div key={value} initial={{ scale: 1.18 }} animate={{ scale: 1 }} className="text-lg font-bold tabular-nums">{value}</motion.div>
      </div>
    </div>
  )
}

function EncounterCard({ card, index, onPick }: { card: Encounter; index: number; onPick: () => void }) {
  const meta = ENCOUNTER_META[card.kind]
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 18, rotate: -2 + index }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: -24, rotate: 4 - index * 2, transition: { duration: 0.2 } }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={SPRINGS.standard}
      onClick={onPick}
      className="text-left rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/40 p-4 hover:border-white/20 transition-colors"
    >
      <div className={`size-10 rounded-2xl bg-gradient-to-br ${meta.color} grid place-items-center text-white shadow-lg mb-3`}>
        <meta.Icon size={18} />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{card.kind}</div>
      <p className="text-sm leading-snug text-zinc-100">{card.label}</p>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-rose-400">−{card.staminaCost} stamina</span>
        <span className="text-violet-300">+{card.xpReward} XP</span>
      </div>
    </motion.button>
  )
}

// ── Run ended ───────────────────────────────────────────────────────────────

function RunEnded({ state, pbs, onAgain, onHome }: { state: GameState; pbs: PersonalBests; onAgain: () => void; onHome: () => void }) {
  const won = state.status === 'won'
  const bossMeta = BOSS_META[state.boss]
  const isPersonalBest = state.xp === pbs.bestXp && state.xp > 0
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto text-center py-8">
      <motion.div
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...SPRINGS.soft, delay: 0.1 }}
        className={`mx-auto size-24 rounded-3xl bg-gradient-to-br ${won ? bossMeta.accent : 'from-zinc-700 to-zinc-900'} grid place-items-center shadow-2xl mb-5`}
      >
        <span className="text-5xl">{won ? bossMeta.emoji : '💀'}</span>
      </motion.div>
      <h2 className="text-3xl font-bold tracking-tight">{won ? `You defeated ${bossMeta.label}` : 'You ran out of stamina'}</h2>
      {isPersonalBest && <p className="mt-2 text-amber-300 text-sm">⭐ New personal-best XP</p>}
      <div className="mt-6 grid grid-cols-3 gap-3 max-w-md mx-auto">
        <PBStat label="Floor" value={`${state.floor}`} accent="text-amber-300" />
        <PBStat label="XP" value={`${state.xp}`} accent="text-violet-300" />
        <PBStat label="Stamina" value={`${state.stamina}`} accent="text-rose-300" />
      </div>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Btn tone="primary" onClick={onAgain} className="!text-sm !px-5 !py-3">Run again</Btn>
        <Btn tone="ghost" onClick={onHome} className="!text-sm !px-5 !py-3">Lobby</Btn>
      </div>
    </motion.div>
  )
}
