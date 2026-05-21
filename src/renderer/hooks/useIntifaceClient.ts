// File: src/renderer/hooks/useIntifaceClient.ts
//
// #196 — Buttplug.io / Intiface Central WebSocket client. Connects to
// the user's locally running Intiface server on ws://127.0.0.1:12345
// (default port) and exposes:
//   - connection status (connecting / connected / error / disconnected)
//   - device list (name + vibration capability)
//   - vibrate(intensity 0-1) — sends ScalarCmd to all connected devices
//
// Uses raw WebSocket + the Buttplug protocol JSON messages instead of
// pulling buttplug-js (~120KB minified + browserify shim). Just enough
// of the protocol to handshake + scan + vibrate.

import { useEffect, useRef, useState, useCallback } from 'react'

interface ButtplugDevice {
  deviceIndex: number
  deviceName: string
  hasScalar: boolean   // can be vibrated / oscillated
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'error'

export interface IntifaceClient {
  state: ConnState
  devices: ButtplugDevice[]
  error: string | null
  connect: (wsUrl?: string) => void
  disconnect: () => void
  /** Set all connected devices to the given scalar intensity (0-1). */
  vibrate: (intensity: number) => void
  scan: () => void
}

const PROTOCOL_VERSION = 3
const CLIENT_NAME = 'Vault'

export function useIntifaceClient(): IntifaceClient {
  const [state, setState] = useState<ConnState>('idle')
  const [devices, setDevices] = useState<ButtplugDevice[]>([])
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const msgIdRef = useRef<number>(1)

  const send = useCallback((message: any) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const id = msgIdRef.current++
    const wrapped = Object.fromEntries(Object.entries(message).map(([k, v]) => [k, { Id: id, ...(v as any) }]))
    try { ws.send(JSON.stringify([wrapped])) } catch (err) { console.warn('[Intiface] send failed:', err) }
  }, [])

  const handleMessage = useCallback((data: string) => {
    let messages: any[] = []
    try { messages = JSON.parse(data) } catch { return }
    for (const env of messages) {
      const [type, payload] = Object.entries(env)[0] as [string, any]
      if (type === 'ServerInfo') {
        // Handshake done — start scanning.
        send({ StartScanning: {} })
      } else if (type === 'DeviceAdded') {
        const idx = Number(payload.DeviceIndex)
        const name = String(payload.DeviceName ?? `Device ${idx}`)
        const msgs = payload.DeviceMessages ?? payload.DeviceMessageTimingGap ?? {}
        const hasScalar = !!(msgs.ScalarCmd || msgs.VibrateCmd)
        setDevices(prev => prev.find(d => d.deviceIndex === idx)
          ? prev
          : [...prev, { deviceIndex: idx, deviceName: name, hasScalar }])
      } else if (type === 'DeviceRemoved') {
        const idx = Number(payload.DeviceIndex)
        setDevices(prev => prev.filter(d => d.deviceIndex !== idx))
      } else if (type === 'DeviceList') {
        const list = (payload.Devices ?? []) as any[]
        setDevices(list.map(d => ({
          deviceIndex: Number(d.DeviceIndex),
          deviceName: String(d.DeviceName ?? `Device ${d.DeviceIndex}`),
          hasScalar: !!(d.DeviceMessages?.ScalarCmd || d.DeviceMessages?.VibrateCmd),
        })))
      } else if (type === 'Error') {
        setError(String(payload.ErrorMessage ?? 'Intiface error'))
      }
    }
  }, [send])

  const connect = useCallback((wsUrl?: string) => {
    const url = wsUrl ?? 'ws://127.0.0.1:12345'
    if (wsRef.current) try { wsRef.current.close() } catch { /* noop */ }
    setError(null)
    setState('connecting')
    setDevices([])
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      ws.onopen = () => {
        setState('connected')
        // Handshake: identify the client.
        const id = msgIdRef.current++
        ws.send(JSON.stringify([{ RequestServerInfo: { Id: id, ClientName: CLIENT_NAME, MessageVersion: PROTOCOL_VERSION } }]))
      }
      ws.onmessage = (e) => handleMessage(String(e.data))
      ws.onerror = () => {
        setError('WebSocket error — is Intiface Central running?')
        setState('error')
      }
      ws.onclose = () => {
        if (state !== 'error') setState('idle')
      }
    } catch (err: any) {
      setError(err?.message ?? 'connect failed')
      setState('error')
    }
  }, [handleMessage, state])

  const disconnect = useCallback(() => {
    if (wsRef.current) try { wsRef.current.close() } catch { /* noop */ }
    wsRef.current = null
    setState('idle')
    setDevices([])
  }, [])

  const vibrate = useCallback((intensity: number) => {
    const clamped = Math.max(0, Math.min(1, intensity))
    for (const d of devices) {
      if (!d.hasScalar) continue
      // ScalarCmd v3: ScalarCmd: { DeviceIndex, Scalars: [{ Index:0, Scalar:0-1, ActuatorType:'Vibrate' }] }
      send({
        ScalarCmd: {
          DeviceIndex: d.deviceIndex,
          Scalars: [{ Index: 0, Scalar: clamped, ActuatorType: 'Vibrate' }],
        },
      })
    }
  }, [devices, send])

  const scan = useCallback(() => send({ StartScanning: {} }), [send])

  // Subscribe to window `vault:haptic-pulse` events. Any component
  // can dispatch one to fire a short, auto-stopping pulse without
  // owning the Intiface connection — Cock-Hero beats, climax cues,
  // tutorial highlights, etc. No-op when no devices are connected.
  useEffect(() => {
    const onPulse = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { intensity?: number; durationMs?: number } | undefined
      if (!detail) return
      const intensity = Math.max(0, Math.min(1, detail.intensity ?? 0.6))
      const durationMs = Math.max(40, Math.min(2000, detail.durationMs ?? 120))
      vibrate(intensity)
      window.setTimeout(() => vibrate(0), durationMs)
    }
    window.addEventListener('vault:haptic-pulse', onPulse as EventListener)
    return () => window.removeEventListener('vault:haptic-pulse', onPulse as EventListener)
  }, [vibrate])

  // Cleanup on unmount.
  useEffect(() => () => {
    if (wsRef.current) try { wsRef.current.close() } catch { /* noop */ }
  }, [])

  return { state, devices, error, connect, disconnect, vibrate, scan }
}
