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
// #320 — extended attributes (now-playing, position, oCount, etc.)
let publishAttrs: ((attrs: Record<string, any>) => void) | null = null

const ENTITY_ID = 'vault'
const DISCOVERY_TOPIC = `homeassistant/media_player/${ENTITY_ID}/config`
const STATE_TOPIC = `vault/state`
const COMMAND_TOPIC = `vault/cmd`
// #320 — extended topics for the two-way bridge.
const ATTR_TOPIC = `vault/attrs`           // JSON blob with current state
const CMD_EXT_TOPIC = `vault/cmd/+`        // wildcard for cmd/seek, cmd/favorite, etc.

// #320 — extended command vocabulary. Mapped to renderer-side actions.
export type HaCommand =
  | 'play' | 'pause' | 'stop' | 'next' | 'previous'
  | 'volume_up' | 'volume_down'
  | 'favorite_toggle' | 'rating_up' | 'rating_down'
  | 'seek_forward' | 'seek_back'
  | 'lockout_trigger' | 'lockout_cancel'
  | 'panic_on' | 'panic_off'
  | 'stealth_on' | 'stealth_off'
  | { kind: 'seek'; toSec: number }
  | { kind: 'rate'; value: number }
  | { kind: 'open_media'; mediaId: string }

export async function startHaMqtt(opts: {
  brokerUrl: string         // e.g. "mqtt://192.168.1.10:1883"
  username?: string
  password?: string
  onCommand: (cmd: HaCommand) => void
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
    // Subscribe to both the legacy single topic and the wildcard ext path.
    client.subscribe([COMMAND_TOPIC, CMD_EXT_TOPIC], { qos: 1 }, (err) => {
      if (err) console.warn('[HA-MQTT] subscribe error:', err)
    })
    client.on('message', (topic, payload) => {
      const body = payload.toString().trim()
      if (topic === COMMAND_TOPIC) {
        const cmd = body.toLowerCase() as HaCommand
        const known = ['play', 'pause', 'stop', 'next', 'previous', 'volume_up', 'volume_down',
                       'favorite_toggle', 'rating_up', 'rating_down', 'seek_forward', 'seek_back',
                       'lockout_trigger', 'lockout_cancel', 'panic_on', 'panic_off', 'stealth_on', 'stealth_off']
        if (typeof cmd === 'string' && known.includes(cmd)) opts.onCommand(cmd)
        return
      }
      // Wildcard: vault/cmd/<verb> — body is a payload (number, mediaId, etc.)
      const verb = topic.slice(`vault/cmd/`.length)
      switch (verb) {
        case 'seek': {
          const toSec = Number(body)
          if (!Number.isNaN(toSec)) opts.onCommand({ kind: 'seek', toSec })
          break
        }
        case 'rate': {
          const value = Number(body)
          if (!Number.isNaN(value) && value >= 0 && value <= 5) opts.onCommand({ kind: 'rate', value })
          break
        }
        case 'open_media': {
          if (body.length > 0) opts.onCommand({ kind: 'open_media', mediaId: body })
          break
        }
        default:
          // Unknown verb — log once for debugging but don't crash.
          console.warn(`[HA-MQTT] ignoring unknown cmd verb: ${verb}`)
      }
    })
    publishState = (state) => {
      try { client?.publish(STATE_TOPIC, state, { retain: true }) } catch { /* noop */ }
    }
    publishAttrs = (attrs) => {
      try { client?.publish(ATTR_TOPIC, JSON.stringify(attrs), { retain: true }) } catch { /* noop */ }
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

// #320 — publish the extended attribute blob for HA template sensors
// + Stream Deck button text. Caller decides cadence (e.g. on play /
// pause / seek / favorite-toggle, not every frame).
export function publishHaAttrs(attrs: {
  now_playing?: string
  position_sec?: number
  duration_sec?: number
  o_count?: number
  rating?: number
  is_favorite?: boolean
  media_id?: string
  performers?: string[]
  panic_active?: boolean
  lockout_active?: boolean
}): void {
  publishAttrs?.(attrs)
}

export function isHaMqttConnected(): boolean {
  return !!(client && client.connected)
}
