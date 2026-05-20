// File: src/renderer/pages/SessionsPage.tsx
//
// New top-level "Sessions" surface. Five sub-views accessed via a
// horizontal pill nav:
//
//   Live      — current session control room (HR, climax-verify,
//                stroke-tempo, persona, voice mic, lockout, XP)
//   Devices   — sub-toy pairing (ESP32 / Apple Watch / Arduino / HR band)
//   Game      — goon-game roguelike
//   Coach     — task wheel + JOI scripts + audio erotica picker
//   History   — orgasm budget ledger + recap stats

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SPRINGS } from '../components/network/motion-tokens'
import {
  Activity,
  Cable,
  Gamepad2,
  ScrollText,
  History,
  Sparkles,
} from 'lucide-react'
import { LiveSessionView } from '../components/sessions/LiveSessionView'
import { DevicesView } from '../components/sessions/DevicesView'
import { GoonGameView } from '../components/sessions/GoonGameView'
import { CoachView } from '../components/sessions/CoachView'
import { HistoryView } from '../components/sessions/HistoryView'

type SubTab = 'live' | 'devices' | 'game' | 'coach' | 'history'

const SUB_TABS: Array<{ id: SubTab; label: string; Icon: typeof Activity; accent: string }> = [
  { id: 'live', label: 'Live', Icon: Activity, accent: 'from-pink-500 to-rose-600' },
  { id: 'devices', label: 'Devices', Icon: Cable, accent: 'from-cyan-500 to-blue-600' },
  { id: 'game', label: 'Game', Icon: Gamepad2, accent: 'from-violet-500 to-purple-600' },
  { id: 'coach', label: 'Coach', Icon: ScrollText, accent: 'from-amber-500 to-orange-600' },
  { id: 'history', label: 'History', Icon: History, accent: 'from-emerald-500 to-teal-600' },
]

export default function SessionsPage() {
  const [sub, setSub] = useState<SubTab>(() => {
    const stored = (localStorage.getItem('vault.sessions.sub') as SubTab | null)
    return stored && SUB_TABS.some((t) => t.id === stored) ? stored : 'live'
  })
  useEffect(() => { localStorage.setItem('vault.sessions.sub', sub) }, [sub])

  const active = useMemo(() => SUB_TABS.find((t) => t.id === sub) ?? SUB_TABS[0], [sub])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={SPRINGS.soft}
            className={`size-10 rounded-2xl bg-gradient-to-br ${active.accent} grid place-items-center shadow-lg shadow-black/40`}
          >
            <Sparkles size={20} className="text-white drop-shadow" />
          </motion.div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
            <p className="text-[11px] text-zinc-400">Live control · paired devices · roguelike · coaching · history</p>
          </div>
        </div>

        {/* Pill nav with animated indicator. flex-wrap so 5 tabs don't
            overflow a narrow header — wraps to two lines at <960px. */}
        <nav className="relative flex flex-wrap items-center gap-1 rounded-2xl bg-black/30 border border-white/5 p-1 backdrop-blur-xl">
          {SUB_TABS.map((tab) => {
            const isActive = sub === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setSub(tab.id)}
                className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sessions-tab-pill"
                    className={`absolute inset-0 rounded-xl bg-gradient-to-br ${tab.accent} -z-10 shadow-md`}
                    transition={SPRINGS.snappy}
                  />
                )}
                <tab.Icon size={14} strokeWidth={isActive ? 2.5 : 1.75} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Animated view swap */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={sub}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute inset-0 overflow-y-auto"
          >
            {sub === 'live' && <LiveSessionView />}
            {sub === 'devices' && <DevicesView />}
            {sub === 'game' && <GoonGameView />}
            {sub === 'coach' && <CoachView />}
            {sub === 'history' && <HistoryView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
