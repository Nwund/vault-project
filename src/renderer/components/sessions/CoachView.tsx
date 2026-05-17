// File: src/renderer/components/sessions/CoachView.tsx
//
// Coaching sub-view. Two interactive tools:
//
//   1. Task wheel — pick a random task from the curated pool with
//      a spinner animation. Intensity filter chip row.
//   2. JOI script player — paste / type a JOI script, parse cues,
//      preview synth playback.

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SPRINGS } from '../network/motion-tokens'
import { RotateCw, ScrollText, Play, Pause, Volume2 } from 'lucide-react'
import { Btn } from '../ui/Btn'

const CATEGORY_COLORS: Record<string, string> = {
  edge: 'from-amber-500 to-orange-600',
  pause: 'from-blue-500 to-cyan-600',
  reverse: 'from-purple-500 to-violet-600',
  position: 'from-emerald-500 to-teal-600',
  sensation: 'from-pink-500 to-rose-600',
  denial: 'from-red-600 to-rose-700',
}

export function CoachView() {
  return (
    <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TaskWheelTile />
      <JoiPlayerTile />
    </div>
  )
}

// ── Task wheel ────────────────────────────────────────────────────────────

function TaskWheelTile() {
  const [task, setTask] = useState<{ text: string; category: string; intensity?: number; durationSec?: number } | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [maxIntensity, setMaxIntensity] = useState<1 | 2 | 3 | 4 | 5>(5)

  const spin = async () => {
    setSpinning(true)
    // Visual spin for ~700ms then reveal.
    await new Promise((r) => setTimeout(r, 700))
    const r = await window.api.taskWheel.pick({ maxIntensity, excludeIds: task ? [(task as any).id].filter(Boolean) : [] })
    setSpinning(false)
    if (r.ok && r.task) setTask(r.task as any)
  }

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 grid place-items-center text-white shadow-lg">
            <RotateCw size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Task wheel</h3>
            <p className="text-[10px] text-zinc-500">Random pick from curated tease & denial pool</p>
          </div>
        </div>

        {/* Intensity chip row */}
        <div className="flex items-center gap-1 mb-4">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-2">Max intensity:</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setMaxIntensity(n as 1 | 2 | 3 | 4 | 5)}
              className={`size-6 rounded-md text-[10px] font-bold transition ${
                maxIntensity === n ? 'bg-blue-500/30 text-blue-100 border border-blue-500/50' : 'bg-black/20 text-zinc-500 border border-white/5 hover:border-white/15'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Wheel display */}
        <div className="relative aspect-[2/1] rounded-xl bg-black/40 border border-white/5 grid place-items-center overflow-hidden mb-4">
          <AnimatePresence mode="wait">
            {spinning ? (
              <motion.div
                key="spinning"
                animate={{ rotate: 720 }}
                transition={{ duration: 0.7, ease: [0.45, 0.05, 0.55, 0.95] }}
                className="text-5xl"
              >
                🎯
              </motion.div>
            ) : task ? (
              <motion.div
                key={task.text}
                initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={SPRINGS.standard}
                className="text-center px-6"
              >
                <div className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider mb-2 bg-gradient-to-r ${CATEGORY_COLORS[task.category] ?? 'from-zinc-500 to-zinc-700'} text-white`}>
                  {task.category} · {'★'.repeat(task.intensity ?? 1)}
                </div>
                <p className="text-sm font-medium text-zinc-100 leading-snug">{task.text}</p>
                {task.durationSec && (
                  <p className="text-[11px] text-zinc-400 mt-1">{task.durationSec}s</p>
                )}
              </motion.div>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] text-zinc-500">
                Press <span className="text-zinc-300 font-medium">Spin</span> for a task.
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-end">
          <Btn tone="primary" onClick={spin} disabled={spinning}>{spinning ? 'Spinning…' : task ? 'Spin again' : 'Spin'}</Btn>
        </div>
      </div>
    </motion.div>
  )
}

// ── JOI player ────────────────────────────────────────────────────────────

const SAMPLE_JOI = `[mistress]
Look at me.
[pause 3]
Slow down. I said slow.
[pause 5]
You're not allowed to come yet. Hold it.`

function JoiPlayerTile() {
  const [text, setText] = useState(SAMPLE_JOI)
  const [cues, setCues] = useState<Array<{ kind: 'speak' | 'pause'; text?: string; sec?: number }>>([])
  const [playing, setPlaying] = useState(false)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const parse = async () => {
    const r = await window.api.joi.parse(text)
    if (r.ok && r.cues) setCues(r.cues as any)
  }

  const play = async () => {
    setPlaying(true)
    const r = await window.api.joi.render({ text })
    if (!r.ok || !r.entries) { setPlaying(false); return }
    for (let i = 0; i < r.entries.length; i++) {
      const entry = r.entries[i]
      setActiveIdx(i)
      if (entry.cue.kind === 'pause' && entry.cue.sec) {
        await new Promise((res) => setTimeout(res, entry.cue.sec! * 1000))
      } else if (entry.audioBase64) {
        await new Promise<void>((res) => {
          const audio = new Audio(`data:${entry.audioMime ?? 'audio/wav'};base64,${entry.audioBase64}`)
          audio.onended = () => res()
          audio.onerror = () => res()
          audio.play().catch(() => res())
        })
      }
    }
    setPlaying(false)
    setActiveIdx(null)
  }

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
      <div className="p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center text-white shadow-lg">
            <ScrollText size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">JOI script</h3>
            <p className="text-[10px] text-zinc-500">Paste a script · render with cloned voice</p>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full rounded-lg bg-black/30 border border-white/5 p-3 text-[12px] font-mono text-zinc-200 focus:outline-none focus:border-violet-500/50 transition resize-none"
        />
        <div className="flex items-center gap-2 mt-3">
          <Btn tone="subtle" onClick={parse}>Parse</Btn>
          <Btn tone="primary" onClick={play} disabled={playing}>
            {playing ? <><Pause size={11} className="inline mr-1" />Playing…</> : <><Play size={11} className="inline mr-1" />Play with voice</>}
          </Btn>
          <span className="text-[10px] text-zinc-500 ml-auto"><Volume2 size={10} className="inline mr-1" />XTTS cloned voice</span>
        </div>

        {cues.length > 0 && (
          <div className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-black/30 border border-white/5 p-2 text-[11px] space-y-1">
            {cues.map((cue, i) => (
              <motion.div
                key={i}
                animate={{
                  backgroundColor: activeIdx === i ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0)',
                  borderColor: activeIdx === i ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0)',
                }}
                className="rounded px-2 py-1 border"
              >
                {cue.kind === 'pause' ? (
                  <span className="text-zinc-500">⏸ pause {cue.sec}s</span>
                ) : (
                  <span className="text-zinc-200">› {cue.text}</span>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
