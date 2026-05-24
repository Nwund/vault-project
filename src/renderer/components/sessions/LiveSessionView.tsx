// File: src/renderer/components/sessions/LiveSessionView.tsx
//
// The "control room" for an active session. Six tiles:
//
//   1. Persona switcher (Mistress / Stepsister / Cheerleader / Boss / Goonbud)
//   2. Live heart rate (Web Bluetooth) + edge-zone monitor
//   3. Climax verifier (webcam + audio + HR fusion)
//   4. Stroke-tempo metronome (webcam wrist-Y autocorrelation)
//   5. Lockout + budget + XP scoreboard
//   6. Voice mic + persona narrative live feed
//
// Tiles use motion's layout primitives for smooth resize when the
// active state changes (e.g. expanded HR chart while locked).

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useVisibilityInterval } from '../../hooks/useVisibilityInterval'
import { HeartPulse, Webcam, Crown, Activity, Lock, Mic, MicOff, ChevronDown, X } from 'lucide-react'
import { SPRINGS } from '../network/motion-tokens'
import { useToast } from '../../contexts'
import { Btn } from '../ui/Btn'
import { connectHeartRateBand, EdgeZoneMonitor, type HrReading, type HrHandle } from '../../utils/heart-rate-ble'
import { startVerifier } from '../../utils/climax-verifier'
import { startStrokeTempo } from '../../utils/stroke-tempo'

type Persona = 'goonbud' | 'mistress' | 'stepsister' | 'boss' | 'cheerleader'

const PERSONAS: Array<{ id: Persona; label: string; tagline: string; accent: string; emoji: string }> = [
  { id: 'goonbud', label: 'Goon Bud', tagline: 'Hype + edging coach', accent: 'from-fuchsia-500 to-pink-500', emoji: '🤝' },
  { id: 'mistress', label: 'Mistress', tagline: 'Strict + contract-aware', accent: 'from-red-600 to-rose-700', emoji: '👑' },
  { id: 'stepsister', label: 'Stepsister', tagline: 'Bratty taunts', accent: 'from-purple-500 to-violet-600', emoji: '😈' },
  { id: 'boss', label: 'Boss', tagline: 'Cold + transactional', accent: 'from-slate-500 to-zinc-700', emoji: '💼' },
  { id: 'cheerleader', label: 'Cheerleader', tagline: 'Sweet encouragement', accent: 'from-yellow-400 to-amber-500', emoji: '🎀' },
]

interface BudgetStatus { budget: number; climaxesThisMonth: number; remaining: number; budgetHealthPct: number; inRelapse: boolean }
interface LockoutState { enabled: boolean; durationMin: number; remainingMs: number; active: boolean }
interface EdgingStats { totalSessions?: number; totalXp?: number; longestStreak?: number; currentStreak?: number }

export function LiveSessionView() {
  const [persona, setPersona] = useState<Persona>(() => (localStorage.getItem('vault.sessions.persona') as Persona | null) ?? 'goonbud')
  useEffect(() => { localStorage.setItem('vault.sessions.persona', persona) }, [persona])

  return (
    <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-4 auto-rows-min">
      <PersonaTile persona={persona} setPersona={setPersona} />
      <HeartRateTile />
      <ScoreboardTile />
      <ClimaxVerifierTile />
      <StrokeTempoTile />
      <VoiceCoachTile persona={persona} />
    </div>
  )
}

// ── Tile shell ──────────────────────────────────────────────────────────────

function Tile({
  title,
  Icon,
  accent,
  children,
  span = 1,
}: { title: string; Icon: typeof HeartPulse; accent: string; children: React.ReactNode; span?: 1 | 2 | 3 }) {
  return (
    <motion.div
      layout
      transition={SPRINGS.standard}
      className={`relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30 ${span === 2 ? 'lg:col-span-2' : span === 3 ? 'lg:col-span-3' : ''}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`size-7 rounded-lg bg-gradient-to-br ${accent} grid place-items-center text-white shadow`}>
            <Icon size={14} strokeWidth={2.25} />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        {children}
      </div>
    </motion.div>
  )
}

// ── Persona switcher ────────────────────────────────────────────────────────

function PersonaTile({ persona, setPersona }: { persona: Persona; setPersona: (p: Persona) => void }) {
  const active = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0]
  return (
    <Tile title="Persona" Icon={Crown} accent={active.accent}>
      <div className="grid grid-cols-5 gap-1.5">
        {PERSONAS.map((p) => {
          const isActive = persona === p.id
          return (
            <motion.button
              key={p.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.93 }}
              onClick={() => setPersona(p.id)}
              className={`relative rounded-xl px-1 py-2.5 text-[10px] font-medium border transition ${
                isActive
                  ? 'bg-white/10 border-white/20 text-white shadow-inner'
                  : 'bg-black/20 border-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
              title={p.tagline}
            >
              <div className="text-base leading-tight mb-0.5">{p.emoji}</div>
              <div className="leading-tight">{p.label}</div>
              {isActive && (
                <motion.div
                  layoutId="persona-active-dot"
                  className={`absolute -bottom-1 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-gradient-to-r ${p.accent}`}
                />
              )}
            </motion.button>
          )
        })}
      </div>
      <div className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
        <span className="text-zinc-300 font-medium">{active.label}</span> · {active.tagline}
        {persona === 'mistress' && <div className="mt-1 text-amber-400/80">⚠ Contract context will be auto-injected.</div>}
      </div>
    </Tile>
  )
}

// ── Heart rate band + edge-zone ─────────────────────────────────────────────

function HeartRateTile() {
  const [hr, setHr] = useState<HrHandle | null>(null)
  const [reading, setReading] = useState<HrReading | null>(null)
  const [history, setHistory] = useState<HrReading[]>([])
  const [edgeThreshold, setEdgeThreshold] = useState(120)
  const [coolThreshold, setCoolThreshold] = useState(100)
  const monitorRef = useRef<EdgeZoneMonitor | null>(null)
  const [edgeFires, setEdgeFires] = useState(0)

  useEffect(() => {
    monitorRef.current = new EdgeZoneMonitor(edgeThreshold, coolThreshold, 6000, () => setEdgeFires((n) => n + 1))
  }, [edgeThreshold, coolThreshold])

  const handleConnect = async () => {
    try {
      const handle = await connectHeartRateBand()
      setHr(handle)
      handle.onReading((r) => {
        setReading(r)
        monitorRef.current?.feed(r)
        setHistory((h) => [...h.slice(-119), r])
      })
    } catch (err: any) {
      console.warn('[hr] connect failed', err)
    }
  }
  const handleDisconnect = useCallback(() => { hr?.disconnect(); setHr(null); setReading(null); setHistory([]) }, [hr])
  // #333 — End-session bus event also disconnects the HR band.
  useEffect(() => {
    const onEndAll = () => handleDisconnect()
    window.addEventListener('sessions:end-all', onEndAll)
    return () => window.removeEventListener('sessions:end-all', onEndAll)
  }, [handleDisconnect])

  // Build SVG sparkline path.
  const path = (() => {
    if (history.length < 2) return ''
    const minBpm = Math.min(...history.map((h) => h.bpm))
    const maxBpm = Math.max(...history.map((h) => h.bpm))
    const range = Math.max(20, maxBpm - minBpm)
    return history.map((h, i) => {
      const x = (i / (history.length - 1)) * 100
      const y = 100 - ((h.bpm - minBpm) / range) * 100
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ')
  })()

  return (
    <Tile title="Heart Rate" Icon={HeartPulse} accent="from-red-500 to-pink-600">
      {!hr ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <p className="text-[11px] text-zinc-400 text-center max-w-[180px]">
            Pair any Bluetooth HRM (Polar H10, Coros, TICKR…) for edge-zone alerts.
          </p>
          <Btn tone="primary" onClick={handleConnect}>Connect band</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <motion.span
                key={reading?.bpm ?? 0}
                initial={{ scale: 1.15, color: '#f43f5e' }}
                animate={{ scale: 1, color: '#fafafa' }}
                transition={{ duration: 0.5 }}
                className="text-4xl font-bold tabular-nums tracking-tight"
              >
                {reading?.bpm ?? '—'}
              </motion.span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">BPM</span>
            </div>
            <button onClick={handleDisconnect} className="text-zinc-500 hover:text-zinc-300" title="Disconnect">
              <X size={14} />
            </button>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16 mt-2">
            {/* Edge zone band */}
            <rect x="0" y="0" width="100" height="40" fill="url(#hr-edge-gradient)" opacity="0.15" />
            <defs>
              <linearGradient id="hr-edge-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              key={history.length}
              initial={{ pathLength: 0.8, opacity: 0.5 }}
              animate={{ pathLength: 1, opacity: 1 }}
              d={path}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="grid grid-cols-2 gap-3 mt-3 text-[10px]">
            <RangeRow label="Edge threshold" value={edgeThreshold} min={90} max={180} onChange={setEdgeThreshold} color="text-rose-400" />
            <RangeRow label="Cool threshold" value={coolThreshold} min={60} max={140} onChange={setCoolThreshold} color="text-emerald-400" />
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-400">
            <span>Edge fires this session</span>
            <motion.span
              key={edgeFires}
              initial={{ scale: 1.4, color: '#f43f5e' }}
              animate={{ scale: 1, color: '#fafafa' }}
              className="font-bold tabular-nums"
            >
              {edgeFires}
            </motion.span>
          </div>
        </>
      )}
    </Tile>
  )
}

function RangeRow({ label, value, min, max, onChange, color }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; color: string }) {
  return (
    <div>
      <div className={`flex justify-between mb-1 ${color}`}>
        <span>{label}</span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-rose-500" />
    </div>
  )
}

// ── Scoreboard: lockout + edging XP + budget ────────────────────────────────

function ScoreboardTile() {
  const [budget, setBudget] = useState<BudgetStatus | null>(null)
  const [lockout, setLockout] = useState<LockoutState | null>(null)
  const [edging, setEdging] = useState<EdgingStats | null>(null)

  const refresh = async () => {
    const [b, l, e] = await Promise.all([
      window.api.budget.status(),
      window.api.lockout.status(),
      window.api.edging.stats(),
    ])
    if (b.ok && b.status) setBudget(b.status as any)
    if (l.ok && l.state) setLockout(l.state as any)
    if (e.ok) setEdging(e as any)
  }
  // 5s status polling — paused while this sub-tab/window is hidden.
  useVisibilityInterval(refresh, 5000)

  const onTriggerLockout = async (mins: number) => {
    await window.api.lockout.trigger({ durationMin: mins })
    refresh()
  }
  const onCancelLockout = async () => { await window.api.lockout.cancel(); refresh() }
  // #333 — End-session bus event cancels any active lockout too.
  useEffect(() => {
    const onEndAll = () => { void onCancelLockout() }
    window.addEventListener('sessions:end-all', onEndAll)
    return () => window.removeEventListener('sessions:end-all', onEndAll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Tile title="Scoreboard" Icon={Lock} accent="from-amber-500 to-orange-600">
      <div className="space-y-3">
        <Stat label="Budget" value={budget ? `${budget.climaxesThisMonth}/${budget.budget}` : '—'} sub={budget?.inRelapse ? 'IN RELAPSE' : `${budget?.remaining ?? 0} left this month`} subColor={budget?.inRelapse ? 'text-rose-400' : 'text-zinc-500'} />
        <Stat label="XP" value={edging?.totalXp != null ? String(edging.totalXp) : '—'} sub={`Streak ${edging?.currentStreak ?? 0} · Best ${edging?.longestStreak ?? 0}`} subColor="text-zinc-500" />
        <AnimatePresence>
          {lockout?.active && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-rose-300">Locked out</span>
                <button onClick={onCancelLockout} className="text-[10px] text-rose-300 hover:text-rose-100 underline">Cancel</button>
              </div>
              <div className="text-2xl font-bold tabular-nums text-rose-100 mt-1">{formatRemaining(lockout.remainingMs)}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {!lockout?.active && (
          <div className="flex items-center gap-1.5">
            {[15, 60, 240, 1440].map((m) => (
              <Btn key={m} tone="subtle" onClick={() => onTriggerLockout(m)} className="text-[10px] flex-1">
                {m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : `${m / 1440}d`}
              </Btn>
            ))}
          </div>
        )}
      </div>
    </Tile>
  )
}

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub: string; subColor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="flex flex-col items-end">
        <span className="text-lg font-bold tabular-nums">{value}</span>
        <span className={`text-[10px] ${subColor}`}>{sub}</span>
      </div>
    </div>
  )
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

// ── Climax verifier ─────────────────────────────────────────────────────────

function ClimaxVerifierTile() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [running, setRunning] = useState(false)
  const [signals, setSignals] = useState<{ pose: boolean; voice: boolean; hr: boolean; confidence: number } | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  const start = async () => {
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (videoRef.current) {
        videoRef.current.srcObject = cam
        await videoRef.current.play()
      }
      const stop = await startVerifier({
        webcamVideo: videoRef.current!,
        audioStream: cam,
        onDetected: (s) => setSignals(s),
      })
      stopRef.current = stop
      setRunning(true)
    } catch (err) {
      console.warn('[verifier] start failed', err)
    }
  }
  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
    setRunning(false)
    setSignals(null)
  }, [])
  useEffect(() => () => stopRef.current?.(), [])
  // #333 — listen for the page-level End-session bus event.
  useEffect(() => {
    const onEndAll = () => stop()
    window.addEventListener('sessions:end-all', onEndAll)
    return () => window.removeEventListener('sessions:end-all', onEndAll)
  }, [stop])

  return (
    <Tile title="Climax Verifier" Icon={Webcam} accent="from-purple-500 to-fuchsia-600">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black/40 mb-3">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        {!running && (
          <div className="absolute inset-0 grid place-items-center text-[11px] text-zinc-500">
            webcam preview
          </div>
        )}
        {running && (
          <div className="absolute top-2 right-2 size-2 rounded-full bg-rose-500 animate-pulse" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-2">
        {!running ? <Btn tone="primary" onClick={start}>Start</Btn> : <Btn tone="danger" onClick={stop}>Stop</Btn>}
        <span className="text-[10px] text-zinc-500">Pose + audio + HR fusion · 2-of-3 = detected</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <SignalChip label="Pose" on={!!signals?.pose} />
        <SignalChip label="Voice" on={!!signals?.voice} />
        <SignalChip label="HR" on={!!signals?.hr} />
      </div>
      {signals && (
        <div className="mt-2 text-[11px] text-fuchsia-300">
          Confidence: <span className="font-bold tabular-nums">{(signals.confidence * 100).toFixed(0)}%</span>
        </div>
      )}
    </Tile>
  )
}

function SignalChip({ label, on }: { label: string; on: boolean }) {
  return (
    <motion.div
      animate={{
        backgroundColor: on ? 'rgba(217,70,239,0.2)' : 'rgba(255,255,255,0.04)',
        borderColor: on ? 'rgba(217,70,239,0.5)' : 'rgba(255,255,255,0.08)',
      }}
      className="px-2 py-1.5 rounded-lg border text-center text-[10px] font-medium"
    >
      <span className={on ? 'text-fuchsia-300' : 'text-zinc-500'}>{label}</span>
    </motion.div>
  )
}

// ── Stroke tempo metronome ──────────────────────────────────────────────────

function StrokeTempoTile() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [running, setRunning] = useState(false)
  const [bpm, setBpm] = useState<number | null>(null)
  const [target, setTarget] = useState(60)
  const [audible, setAudible] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const click = () => {
    if (!audible) return
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    const ctx = audioCtxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1500
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.05)
  }

  const start = async () => {
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) {
        videoRef.current.srcObject = cam
        await videoRef.current.play()
      }
      const stop = await startStrokeTempo({
        source: videoRef.current!,
        onBpm: (b) => setBpm(b),
        onStroke: () => click(),
      })
      stopRef.current = stop
      setRunning(true)
    } catch (err) {
      console.warn('[tempo] start failed', err)
    }
  }
  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
    setRunning(false)
    setBpm(null)
  }, [])
  useEffect(() => () => stopRef.current?.(), [])
  // #333 — End-session bus event.
  useEffect(() => {
    const onEndAll = () => stop()
    window.addEventListener('sessions:end-all', onEndAll)
    return () => window.removeEventListener('sessions:end-all', onEndAll)
  }, [stop])

  const off = bpm != null ? Math.abs(bpm - target) : 0
  const accuracy = bpm != null ? Math.max(0, 100 - off * 4) : 0

  return (
    <Tile title="Stroke Tempo" Icon={Activity} accent="from-emerald-500 to-cyan-600">
      <div className="flex items-center gap-3">
        <div className="relative size-28 shrink-0">
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
            <motion.circle
              cx="50" cy="50" r="42"
              stroke="url(#tempo-grad)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(accuracy / 100) * (2 * Math.PI * 42)} 999`}
              animate={{ strokeDasharray: `${(accuracy / 100) * (2 * Math.PI * 42)} 999` }}
              transition={{ duration: 0.4 }}
            />
            <defs>
              <linearGradient id="tempo-grad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-2xl font-bold tabular-nums">{bpm != null ? Math.round(bpm) : '—'}</div>
              <div className="text-[9px] text-zinc-500 uppercase">strokes/min</div>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <video ref={videoRef} muted playsInline className="w-full aspect-video rounded-md bg-black/40 object-cover" />
          <div className="mt-2 text-[10px] text-zinc-400">Target: <span className="text-zinc-100 font-bold">{target}</span> bpm</div>
          <input type="range" min={30} max={180} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-emerald-500" />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {!running ? <Btn tone="primary" onClick={start}>Start tracking</Btn> : <Btn tone="danger" onClick={stop}>Stop</Btn>}
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={audible} onChange={(e) => setAudible(e.target.checked)} className="accent-emerald-500" />
          Audible click
        </label>
      </div>
    </Tile>
  )
}

// ── Voice mic + persona narrative ───────────────────────────────────────────

function VoiceCoachTile({ persona }: { persona: Persona }) {
  const { showToast } = useToast()
  const [micOn, setMicOn] = useState(false)
  const [transcript, setTranscript] = useState<string[]>([])
  const recRef = useRef<any>(null)

  const toggleMic = () => {
    if (micOn) {
      try { recRef.current?.stop() } catch { /* ignore */ }
      setMicOn(false)
      return
    }
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SR) { showToast('error', 'Speech recognition unavailable in this browser'); return }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      const last = e.results[e.results.length - 1]
      if (last.isFinal) setTranscript((t) => [...t.slice(-9), last[0].transcript.trim()])
    }
    rec.onerror = () => setMicOn(false)
    rec.onend = () => setMicOn(false)
    rec.start()
    recRef.current = rec
    setMicOn(true)
  }
  useEffect(() => () => { try { recRef.current?.stop() } catch { /* ignore */ } }, [])

  return (
    <Tile title="Voice + Narrative" Icon={micOn ? Mic : MicOff} accent="from-sky-500 to-indigo-600" span={3}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Btn tone={micOn ? 'danger' : 'primary'} onClick={toggleMic}>
              {micOn ? 'Stop listening' : 'Start mic'}
            </Btn>
            <span className="text-[10px] text-zinc-500">Recognizes: pause · play · denied · ruined · spin wheel · lockout · bookmark</span>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/30 p-2 h-32 overflow-y-auto text-[11px] text-zinc-300 font-mono leading-relaxed">
            {transcript.length === 0 ? (
              <span className="text-zinc-500 italic">listening…</span>
            ) : transcript.map((line, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                › {line}
              </motion.div>
            ))}
          </div>
        </div>
        <NarrativeFeed persona={persona} />
      </div>
    </Tile>
  )
}

function NarrativeFeed({ persona }: { persona: Persona }) {
  const [feed, setFeed] = useState<Array<{ text: string; choices?: Array<{ id: string; label: string }> }>>([])
  const [loading, setLoading] = useState(false)

  const fetchTurn = async () => {
    setLoading(true)
    try {
      const r = await window.api.narrative.turn({
        mode: 'cyoa',
        seed: 'live-session',
        history: [],
        persona,
      })
      if (r.ok && r.turn) {
        setFeed((f) => [...f.slice(-4), { text: r.turn!.narrative, choices: r.turn!.choices }])
      } else {
        setFeed((f) => [...f, { text: `(no LLM available: ${r.error ?? 'no narrative'})` }])
      }
    } catch (err: any) {
      setFeed((f) => [...f, { text: `(error: ${err?.message ?? err})` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-zinc-400">Live narrative ({persona})</span>
        <Btn tone="subtle" onClick={fetchTurn} disabled={loading}>{loading ? 'Generating…' : 'New beat'}</Btn>
      </div>
      <div className="rounded-lg border border-white/5 bg-black/30 p-2 h-32 overflow-y-auto text-[11px] text-zinc-200 leading-relaxed">
        {feed.length === 0 ? (
          <span className="text-zinc-500 italic">Press "New beat" to have {persona} narrate.</span>
        ) : feed.map((entry, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mb-2">
            <div>{entry.text}</div>
            {entry.choices && (
              <div className="flex gap-1.5 flex-wrap mt-1">
                {entry.choices.map((c) => (
                  <button key={c.id} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 transition">{c.label}</button>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
