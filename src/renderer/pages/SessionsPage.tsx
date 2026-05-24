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

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SPRINGS } from '../components/network/motion-tokens'
import {
  Activity,
  Cable,
  Gamepad2,
  ScrollText,
  History,
  Sparkles,
  PowerOff,
} from 'lucide-react'
import { useToast } from '../contexts'
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

  // Keyboard 1-5 swaps sub-tabs (#332). Same one-hand-on-numpad pattern
  // as the existing Brainwash + AI Tools nav. Skips when the user is
  // typing in an input so number entry still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < SUB_TABS.length) {
        e.preventDefault()
        setSub(SUB_TABS[idx].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const active = useMemo(() => SUB_TABS.find((t) => t.id === sub) ?? SUB_TABS[0], [sub])
  const { showToast } = useToast()

  // #333 — broadcast 'sessions:end-all' so every live tile (verifier,
  // lockout, stroke tempo, HR monitor, etc.) can stop itself. Plus
  // fire the analytics endSession IPC so any in-progress session row
  // gets a clean close. Tiles register listeners via the bus pattern.
  const endAllSessions = useCallback(async () => {
    try { window.dispatchEvent(new CustomEvent('sessions:end-all')) } catch { /* ignore */ }
    try {
      // Best-effort analytics close. Returns null if no session is open.
      await (window.api as any).invoke?.('analytics:endSession')
    } catch { /* ignore — analytics service may not be initialized */ }
    showToast('success', 'All sessions ended')
  }, [showToast])

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
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

        <div className="flex items-center gap-3">
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
          {/* #333 — End session button. Top-right, danger tone. Fires
              the sessions:end-all bus event (tiles register listeners
              to stop themselves) plus closes analytics. Confirmed
              before firing so a stray click doesn't kill an
              in-progress lockout / verifier. */}
          <button
            onClick={() => {
              if (window.confirm('End all active sessions?\n\nStops verifier, stroke tempo, HR monitor, etc.')) {
                void endAllSessions()
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-xs font-medium transition"
            title="Stop every active session tile + close analytics"
          >
            <PowerOff size={14} />
            End session
          </button>
        </div>
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
