// File: src/renderer/components/sessions/DevicesView.tsx
//
// Pair + control sub-toys. Four device tiles:
//
//   1. ESP32 BLE (Web Bluetooth via VAULT-HAPTIC service UUID)
//   2. Apple Watch via companion BLE bridge
//   3. Arduino over serial (uses main-process node-serialport)
//   4. Heart-rate band (#345 — surfaced again here for the Devices
//      view, since pairing belongs alongside the other devices)
//
// Each tile holds connection state + a small controller surface
// (intensity slider, pattern picker, fire-haptic buttons).

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SPRINGS } from '../network/motion-tokens'
import { Bluetooth, Watch, Usb, HeartPulse, Power, Zap, Waves } from 'lucide-react'
import { Btn } from '../ui/Btn'
import { connectHapticDevice, HAPTIC_PATTERNS, type HapticDeviceHandle } from '../../utils/esp32-haptic'
import { connectAppleWatchBridge, type AppleWatchHandle, type WatchHaptic } from '../../utils/apple-watch-haptic'
import { connectHeartRateBand, type HrHandle, type HrReading } from '../../utils/heart-rate-ble'

export function DevicesView() {
  return (
    <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Esp32Tile />
      <AppleWatchTile />
      <ArduinoTile />
      <HeartRateDeviceTile />
    </div>
  )
}

// ── Shared tile shell ──────────────────────────────────────────────────────

function DeviceTile({
  Icon, name, vendor, accent, children, connected,
}: {
  Icon: typeof Bluetooth
  name: string
  vendor: string
  accent: string
  children: React.ReactNode
  connected: boolean
}) {
  return (
    <motion.div
      layout
      transition={SPRINGS.standard}
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl shadow-xl shadow-black/30"
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-2xl bg-gradient-to-br ${accent} grid place-items-center text-white shadow-lg`}>
              <Icon size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">{name}</h3>
              <p className="text-[10px] text-zinc-500">{vendor}</p>
            </div>
          </div>
          <motion.div
            animate={{
              backgroundColor: connected ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
              color: connected ? '#86efac' : '#71717a',
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-current/20"
          >
            <span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            {connected ? 'Connected' : 'Idle'}
          </motion.div>
        </div>
        {children}
      </div>
    </motion.div>
  )
}

// ── ESP32 ─────────────────────────────────────────────────────────────────

function Esp32Tile() {
  const [handle, setHandle] = useState<HapticDeviceHandle | null>(null)
  const [intensity, setIntensity] = useState(120)
  const [activePattern, setActivePattern] = useState<keyof typeof HAPTIC_PATTERNS | null>(null)

  const connect = async () => {
    try { setHandle(await connectHapticDevice()) }
    catch (err: any) { console.warn('[esp32]', err) }
  }
  const disconnect = () => { handle?.disconnect(); setHandle(null); setActivePattern(null) }
  useEffect(() => { handle?.setIntensity(intensity) }, [intensity, handle])

  return (
    <DeviceTile Icon={Bluetooth} name="ESP32 Haptic" vendor="Web Bluetooth · custom firmware" accent="from-cyan-500 to-blue-600" connected={!!handle}>
      {!handle ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-[11px] text-zinc-400 text-center max-w-[260px]">
            Looks for any device advertising the VAULT-HAPTIC GATT service.
          </p>
          <Btn tone="primary" onClick={connect}>Pair device</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Intensity</span>
            <span className="text-lg font-bold tabular-nums">{intensity}</span>
          </div>
          <input type="range" min={0} max={255} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full accent-cyan-500" />
          <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Patterns</div>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(HAPTIC_PATTERNS) as Array<keyof typeof HAPTIC_PATTERNS>).map((p) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.92 }}
                onClick={() => { setActivePattern(p); handle.playPattern(HAPTIC_PATTERNS[p]) }}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-medium border transition ${
                  activePattern === p ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200' : 'bg-black/20 border-white/5 hover:border-white/15'
                }`}
              >
                {p}
              </motion.button>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Btn tone="danger" onClick={disconnect}>Disconnect</Btn>
          </div>
        </>
      )}
    </DeviceTile>
  )
}

// ── Apple Watch ───────────────────────────────────────────────────────────

const WATCH_HAPTICS: WatchHaptic[] = ['notification', 'success', 'failure', 'click', 'start', 'stop', 'directionUp', 'directionDown']

function AppleWatchTile() {
  const [handle, setHandle] = useState<AppleWatchHandle | null>(null)
  const [intensity, setIntensity] = useState(70)

  const connect = async () => {
    try { setHandle(await connectAppleWatchBridge()) }
    catch (err) { console.warn('[watch]', err) }
  }
  const disconnect = () => { handle?.disconnect(); setHandle(null) }
  useEffect(() => { handle?.setIntensity(intensity) }, [intensity, handle])

  return (
    <DeviceTile Icon={Watch} name="Apple Watch" vendor="iPhone companion BLE bridge" accent="from-pink-500 to-rose-600" connected={!!handle}>
      {!handle ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-[11px] text-zinc-400 text-center max-w-[260px]">
            Run the Vault Haptic Receiver SwiftUI companion on your iPhone, then pair from here.
          </p>
          <Btn tone="primary" onClick={connect}>Pair watch</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Intensity</span>
            <span className="text-lg font-bold tabular-nums">{intensity}</span>
          </div>
          <input type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full accent-pink-500" />
          <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Fire haptic</div>
          <div className="grid grid-cols-4 gap-1.5">
            {WATCH_HAPTICS.map((h) => (
              <motion.button
                key={h}
                whileTap={{ scale: 0.92 }}
                onClick={() => handle.fire(h)}
                className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-black/20 border border-white/5 hover:border-pink-500/40 hover:bg-pink-500/10 transition"
              >
                {h}
              </motion.button>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Btn tone="danger" onClick={disconnect}>Disconnect</Btn>
          </div>
        </>
      )}
    </DeviceTile>
  )
}

// ── Arduino (main-process serial bridge) ──────────────────────────────────

function ArduinoTile() {
  const [ports, setPorts] = useState<Array<{ path: string; manufacturer?: string }>>([])
  const [selectedPort, setSelectedPort] = useState<string | null>(null)
  const [intensity, setIntensity] = useState(60)
  const [status, setStatus] = useState<{ connected: boolean; path: string; ready: boolean; lastError: string | null } | null>(null)

  const refreshPorts = async () => {
    try { setPorts(await window.api.arduinoToy.listPorts()) }
    catch { /* ignore */ }
  }
  useEffect(() => { refreshPorts() }, [])

  const refreshStatus = async () => {
    try { setStatus(await window.api.arduinoToy.status()) }
    catch { /* ignore */ }
  }
  useEffect(() => { refreshStatus(); const id = setInterval(refreshStatus, 2000); return () => clearInterval(id) }, [])

  const connect = async () => {
    if (!selectedPort) return
    await window.api.arduinoToy.open(selectedPort)
    refreshStatus()
  }
  const disconnect = async () => { await window.api.arduinoToy.close(); refreshStatus() }
  useEffect(() => { if (status?.connected) window.api.arduinoToy.setIntensity(intensity) }, [intensity, status?.connected])

  return (
    <DeviceTile Icon={Usb} name="Arduino DIY toy" vendor="USB serial · custom sketch" accent="from-amber-500 to-orange-600" connected={!!status?.connected}>
      {!status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={selectedPort ?? ''}
              onChange={(e) => setSelectedPort(e.target.value || null)}
              className="flex-1 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-[11px]"
            >
              <option value="">— pick a serial port —</option>
              {ports.map((p) => (
                <option key={p.path} value={p.path}>{p.path}{p.manufacturer ? ` · ${p.manufacturer}` : ''}</option>
              ))}
            </select>
            <Btn tone="subtle" onClick={refreshPorts}>Rescan</Btn>
          </div>
          <div className="flex justify-end">
            <Btn tone="primary" onClick={connect} disabled={!selectedPort}>Open port</Btn>
          </div>
          {status?.lastError && (
            <p className="text-[10px] text-rose-400">{status.lastError}</p>
          )}
        </div>
      ) : (
        <>
          <div className="text-[10px] text-zinc-500 mb-2">{status.path}{status.ready ? ' · READY' : ' · awaiting handshake'}</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Intensity</span>
            <span className="text-lg font-bold tabular-nums">{intensity}</span>
          </div>
          <input type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full accent-amber-500" />
          <div className="mt-3 flex gap-1.5">
            <Btn tone="subtle" onClick={() => window.api.arduinoToy.stop()} className="flex-1"><Power size={11} className="inline mr-1" />Stop</Btn>
            <Btn tone="subtle" onClick={() => window.api.arduinoToy.playPattern([[50, 200], [100, 200], [150, 200], [200, 400], [0, 100]])} className="flex-1"><Zap size={11} className="inline mr-1" />Build</Btn>
            <Btn tone="subtle" onClick={() => window.api.arduinoToy.playPattern([[255, 100], [0, 50], [255, 100], [0, 50], [255, 600]])} className="flex-1"><Waves size={11} className="inline mr-1" />Burst</Btn>
          </div>
          <div className="mt-3 flex justify-end">
            <Btn tone="danger" onClick={disconnect}>Close port</Btn>
          </div>
        </>
      )}
    </DeviceTile>
  )
}

// ── Heart-rate band (mirror of LiveSession tile but compact) ───────────────

function HeartRateDeviceTile() {
  const [hr, setHr] = useState<HrHandle | null>(null)
  const [reading, setReading] = useState<HrReading | null>(null)

  const connect = async () => {
    try {
      const h = await connectHeartRateBand()
      setHr(h)
      h.onReading((r) => setReading(r))
    } catch (err) { console.warn('[hr]', err) }
  }
  const disconnect = () => { hr?.disconnect(); setHr(null); setReading(null) }

  return (
    <DeviceTile Icon={HeartPulse} name="Heart rate band" vendor="Bluetooth LE HRS · 0x180D" accent="from-red-500 to-rose-600" connected={!!hr}>
      {!hr ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-[11px] text-zinc-400 text-center max-w-[260px]">Polar H10, TICKR, Coros, Garmin chest strap…</p>
          <Btn tone="primary" onClick={connect}>Pair band</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <motion.span
              key={reading?.bpm ?? 0}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              className="text-3xl font-bold tabular-nums text-rose-300"
            >
              {reading?.bpm ?? '—'}
            </motion.span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">BPM</span>
          </div>
          <p className="text-[11px] text-zinc-400">Live readings stream to the climax verifier and edge-zone monitor.</p>
          <div className="mt-3 flex justify-end">
            <Btn tone="danger" onClick={disconnect}>Disconnect</Btn>
          </div>
        </>
      )}
    </DeviceTile>
  )
}
