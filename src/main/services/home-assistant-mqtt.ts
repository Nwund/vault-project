// File: src/main/services/home-assistant-mqtt.ts
//
// #185 — Home Assistant MQTT integration. Publishes Vault as an
// HA media_player entity via MQTT auto-discovery so users can build
// automations like "if motion in office after 11pm, pause Vault" or
// "if Vault is playing, dim the bedroom Hue lights to 20%".
//
// HA auto-discovery convention:
//   - Publish a config blob to homeassistant/media_player/vault/config
//   - HA spawns the entity automatically
//   - Publish state updates to the state_topic
//   - Subscribe to command_topic for play/pause/etc

import * as mqtt from 'mqtt'

let client: mqtt.MqttClient | null = null
let publishState: ((state: 'playing' | 'paused' | 'idle' | 'off') => void) | null = null

const ENTITY_ID = 'vault'
const DISCOVERY_TOPIC = `homeassistant/media_player/${ENTITY_ID}/config`
const STATE_TOPIC = `vault/state`
const COMMAND_TOPIC = `vault/cmd`

export async function startHaMqtt(opts: {
  brokerUrl: string         // e.g. "mqtt://192.168.1.10:1883"
  username?: string
  password?: string
  onCommand: (cmd: 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'volume_up' | 'volume_down') => void
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (client) {
      try { await client.endAsync() } catch { /* noop */ }
      client = null
    }
    client = mqtt.connect(opts.brokerUrl, {
      username: opts.username,
      password: opts.password,
      reconnectPeriod: 5000,
      clientId: `vault-${Math.random().toString(36).slice(2, 10)}`,
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MQTT connect timeout')), 10000)
      client!.once('connect', () => { clearTimeout(timer); resolve() })
      client!.once('error', (err) => { clearTimeout(timer); reject(err) })
    })
    // Publish HA auto-discovery config so the entity appears
    // automatically. Use retain so HA picks it up after restart.
    const config = {
      name: 'Vault',
      unique_id: ENTITY_ID,
      state_topic: STATE_TOPIC,
      command_topic: COMMAND_TOPIC,
      payload_play: 'play',
      payload_pause: 'pause',
      payload_stop: 'stop',
      payload_next_track: 'next',
      payload_previous_track: 'previous',
      device: {
        identifiers: ['vault-electron'],
        name: 'Vault',
        manufacturer: 'Vault',
        model: 'Electron Desktop App',
      },
    }
    client.publish(DISCOVERY_TOPIC, JSON.stringify(config), { retain: true, qos: 1 })
    client.publish(STATE_TOPIC, 'idle', { retain: true })
    // Subscribe to commands
    client.subscribe(COMMAND_TOPIC, { qos: 1 }, (err) => {
      if (err) console.warn('[HA-MQTT] subscribe error:', err)
    })
    client.on('message', (topic, payload) => {
      if (topic === COMMAND_TOPIC) {
        const cmd = payload.toString().trim().toLowerCase() as any
        if (['play', 'pause', 'stop', 'next', 'previous', 'volume_up', 'volume_down'].includes(cmd)) {
          opts.onCommand(cmd)
        }
      }
    })
    publishState = (state) => {
      try { client?.publish(STATE_TOPIC, state, { retain: true }) } catch { /* noop */ }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export async function stopHaMqtt(): Promise<void> {
  if (!client) return
  try {
    // Publish "off" so HA shows the entity as unavailable.
    client.publish(STATE_TOPIC, 'off', { retain: true })
    await client.endAsync()
  } catch { /* noop */ }
  client = null
  publishState = null
}

export function publishHaState(state: 'playing' | 'paused' | 'idle' | 'off'): void {
  publishState?.(state)
}

export function isHaMqttConnected(): boolean {
  return !!(client && client.connected)
}
