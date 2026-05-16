// File: src/renderer/components/IntifaceCard.tsx
//
// #196 — Buttplug.io / Intiface Central connection card. Connects to
// the user's locally running Intiface server on ws://127.0.0.1:12345,
// shows discovered devices, lets the user test-vibrate.
//
// Real-time funscript sync against player.currentTime is the
// follow-on — this card is the connection + device-discovery layer.

import { useState } from 'react'
import { Zap, Loader2, Plug, AlertTriangle } from 'lucide-react'
import { useIntifaceClient } from '../hooks/useIntifaceClient'
import { useToast } from '../contexts'

export function IntifaceCard() {
  const { showToast } = useToast()
  const intiface = useIntifaceClient()
  const [testIntensity, setTestIntensity] = useState(0.5)

  const connStatusBadge = (() => {
    if (intiface.state === 'connected') return { text: `Connected · ${intiface.devices.length} device${intiface.devices.length === 1 ? '' : 's'}`, color: 'bg-emerald-500/20 text-emerald-300' }
    if (intiface.state === 'connecting') return { text: 'Connecting…', color: 'bg-amber-500/20 text-amber-300' }
    if (intiface.state === 'error') return { text: 'Error', color: 'bg-red-500/20 text-red-300' }
    return { text: 'Disconnected', color: 'bg-zinc-700/40 text-zinc-400' }
  })()

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Plug size={20} className="text-pink-400" />
          <div>
            <div className="text-sm font-semibold">Intiface / Buttplug.io</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">
              Connect to a running Intiface server for haptic device control.
            </div>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] font-medium ${connStatusBadge.color}`}>
          {connStatusBadge.text}
        </div>
      </div>

      {intiface.state !== 'connected' && (
        <div className="space-y-2">
          <button
            disabled={intiface.state === 'connecting'}
            onClick={() => intiface.connect()}
            className="w-full px-3 py-2 rounded-lg bg-pink-600/30 hover:bg-pink-600/40 text-pink-100 text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {intiface.state === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            {intiface.state === 'connecting' ? 'Connecting…' : 'Connect to ws://127.0.0.1:12345'}
          </button>
          {intiface.error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-red-200">{intiface.error}</div>
            </div>
          )}
          <div className="text-[11px] text-[var(--muted)] leading-relaxed">
            Install <a href="https://intiface.com/central/" target="_blank" rel="noopener" className="text-[var(--primary)] hover:underline">Intiface Central</a> and start the server before connecting. Vault sends ScalarCmd messages over WebSocket on the standard port.
          </div>
        </div>
      )}

      {intiface.state === 'connected' && (
        <div className="space-y-3">
          {/* Device list */}
          {intiface.devices.length === 0 ? (
            <div className="text-[11px] text-[var(--muted)] italic">
              No devices yet. Make sure your toy is paired in Intiface Central and click <button className="underline" onClick={() => intiface.scan()}>Scan</button>.
            </div>
          ) : (
            <div className="space-y-1">
              {intiface.devices.map(d => (
                <div key={d.deviceIndex} className="flex items-center justify-between p-2 rounded bg-white/[0.03]">
                  <span className="text-sm">{d.deviceName}</span>
                  <span className="text-[10px] text-emerald-300/80">
                    {d.hasScalar ? 'Vibration' : 'Other'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Test vibration */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-pink-400" />
              <span className="text-xs">Test intensity</span>
              <span className="text-[11px] text-[var(--muted)] tabular-nums ml-auto">{Math.round(testIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={testIntensity * 100}
              onChange={(e) => {
                const v = Number(e.target.value) / 100
                setTestIntensity(v)
                intiface.vibrate(v)
              }}
              className="w-full accent-pink-500"
            />
            <button
              onClick={() => intiface.vibrate(0)}
              className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition text-[var(--muted)]"
            >
              Stop all
            </button>
          </div>

          <button
            onClick={() => { intiface.disconnect(); showToast?.('info', 'Disconnected from Intiface') }}
            className="w-full text-[11px] text-[var(--muted)] hover:text-red-300 transition py-1"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
