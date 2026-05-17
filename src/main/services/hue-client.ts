// File: src/main/services/hue-client.ts
//
// #202 — Phillips Hue Bridge LAN integration for cinema-mode dimming.
//
// Hue Bridge API v1 (still works on every modern bridge):
//   1. Discovery: GET https://discovery.meethue.com/  →  [{ id, internalipaddress }]
//   2. Pair:      POST http://<ip>/api  body={"devicetype":"vault#desktop"}
//                  User must press the physical link button within 30s.
//                  → [{ "success": { "username": "<key>" } }]
//                  → [{ "error": { "type": 101, "description": "..." } }]
//   3. Lights:    GET http://<ip>/api/<user>/lights  →  { "1": {...}, "2": {...} }
//   4. Set state: PUT http://<ip>/api/<user>/lights/<id>/state
//                  body={ on: true, bri: 50, transitiontime: 4 }
//                  (transitiontime is in 100ms units, so 4 = 400ms fade)
//
// No npm dep needed — plain fetch. The bridge listens on plain HTTP
// inside the LAN; HTTPS support is bridge-firmware-dependent and
// unnecessary for local control.

const DISCOVERY_URL = 'https://discovery.meethue.com/'
const DEFAULT_TIMEOUT_MS = 4000

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const body = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    try { return JSON.parse(body) as T } catch { throw new Error(`Non-JSON: ${body.slice(0, 200)}`) }
  } finally {
    clearTimeout(timer)
  }
}

export interface HueBridge {
  id: string
  ip: string
}

export async function discoverBridges(): Promise<HueBridge[]> {
  try {
    const res = await fetchJson<Array<{ id: string; internalipaddress: string }>>(DISCOVERY_URL)
    return res.map((b) => ({ id: b.id, ip: b.internalipaddress }))
  } catch (err) {
    console.warn('[Hue] discovery failed:', err)
    return []
  }
}

export interface HueLight {
  id: string
  name: string
  on: boolean
  brightness: number  // 0-254
  reachable: boolean
}

/**
 * Attempt to register a new application with the bridge. Returns the
 * generated username on success. The user MUST have pressed the
 * physical link button on the bridge within the last ~30s, otherwise
 * the bridge returns error type 101 ("link button not pressed").
 */
export async function pairBridge(bridgeIp: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  try {
    const body = JSON.stringify({ devicetype: 'vault#desktop' })
    const res = await fetchJson<Array<{ success?: { username: string }; error?: { type: number; description: string } }>>(
      `http://${bridgeIp}/api`,
      { method: 'POST', body, headers: { 'Content-Type': 'application/json' } },
    )
    const first = res[0]
    if (first?.success?.username) return { ok: true, username: first.success.username }
    if (first?.error) return { ok: false, error: first.error.description ?? `Hue error ${first.error.type}` }
    return { ok: false, error: 'Unexpected response from bridge' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export async function listLights(bridgeIp: string, username: string): Promise<HueLight[]> {
  try {
    const raw = await fetchJson<Record<string, any>>(`http://${bridgeIp}/api/${username}/lights`)
    return Object.entries(raw).map(([id, l]) => ({
      id,
      name: String(l?.name ?? `Light ${id}`),
      on: Boolean(l?.state?.on),
      brightness: Number(l?.state?.bri ?? 0),
      reachable: Boolean(l?.state?.reachable),
    }))
  } catch (err) {
    console.warn('[Hue] listLights failed:', err)
    return []
  }
}

export async function setLightState(
  bridgeIp: string,
  username: string,
  lightId: string,
  state: { on?: boolean; bri?: number; transitiontime?: number },
): Promise<boolean> {
  try {
    await fetchJson(`http://${bridgeIp}/api/${username}/lights/${lightId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
    return true
  } catch (err) {
    console.warn(`[Hue] setLightState ${lightId} failed:`, err)
    return false
  }
}

// Cinema-mode helpers: snapshot current brightness so we can restore
// it later, then dim every selected light to a target bri (default 30,
// out of 254 = ~12% — bright enough to see your hands, dim enough to
// feel cinematic).
const restoreSnapshot = new Map<string, number>()

export async function cinemaDim(
  bridgeIp: string,
  username: string,
  lightIds: string[],
  targetBri = 30,
): Promise<{ dimmed: number; failed: number }> {
  if (lightIds.length === 0) return { dimmed: 0, failed: 0 }
  // Take a brightness snapshot for restore. Use the latest lights
  // payload so we always restore to the user's actual setting, not
  // a stale value from app boot.
  const lights = await listLights(bridgeIp, username)
  for (const l of lights) {
    if (lightIds.includes(l.id)) restoreSnapshot.set(l.id, l.brightness)
  }
  let dimmed = 0
  let failed = 0
  for (const id of lightIds) {
    const ok = await setLightState(bridgeIp, username, id, { on: true, bri: targetBri, transitiontime: 8 })
    if (ok) dimmed++; else failed++
  }
  return { dimmed, failed }
}

export async function cinemaRestore(
  bridgeIp: string,
  username: string,
  lightIds: string[],
): Promise<{ restored: number; failed: number }> {
  if (lightIds.length === 0) return { restored: 0, failed: 0 }
  let restored = 0
  let failed = 0
  for (const id of lightIds) {
    const bri = restoreSnapshot.get(id) ?? 254
    const ok = await setLightState(bridgeIp, username, id, { bri, transitiontime: 8 })
    if (ok) restored++; else failed++
  }
  return { restored, failed }
}
