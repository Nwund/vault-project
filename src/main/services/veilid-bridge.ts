// File: src/main/services/veilid-bridge.ts
//
// #268 C-44 — Veilid onion-routed private routing. Veilid has no
// usable npm package (their `veilid-node` is a Rust ffi binding
// requiring a manual prebuild, no NPM publish). We bridge to an
// EXTERNAL veilid-server binary via its JSON-RPC API:
//
//   1. User installs veilid-server (https://veilid.com)
//   2. User points Vault at the JSON-RPC port (default 5959)
//   3. Vault calls its routes via fetch()
//
// All operations gracefully no-op if the binary isn't reachable;
// the Settings card can probe via /status() to surface this.
//
// This is the same external-binary pattern we use for Tor (#283),
// ffmpeg, yt-dlp, and whisper.cpp.

let baseUrl = 'http://127.0.0.1:5959'

export function setEndpoint(url: string): void {
  baseUrl = url.replace(/\/$/, '')
}

interface RpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

async function rpc<T>(method: string, params: Record<string, any> = {}): Promise<RpcResult<T>> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const data = await res.json() as T
    return { ok: res.ok, data }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export interface VeilidStatus {
  reachable: boolean
  publicInternetReady: boolean
  localNetworkReady: boolean
  nodeId?: string
  error?: string
}

export async function status(): Promise<VeilidStatus> {
  const r = await rpc<any>('get_state')
  if (!r.ok || !r.data) return { reachable: false, publicInternetReady: false, localNetworkReady: false, error: r.error }
  return {
    reachable: true,
    publicInternetReady: !!r.data.attachment?.public_internet_ready,
    localNetworkReady: !!r.data.attachment?.local_network_ready,
    nodeId: r.data.config?.network?.node_id?.[0],
  }
}

/** Create a private route — returns its identifier so the caller can
 *  share it as the destination for incoming app-messages. */
export async function newPrivateRoute(): Promise<{ ok: boolean; routeId?: string; error?: string }> {
  const r = await rpc<{ route_id: string }>('new_private_route')
  if (!r.ok || !r.data?.route_id) return { ok: false, error: r.error ?? 'no route_id returned' }
  return { ok: true, routeId: r.data.route_id }
}

/** Send an app-message to a remote route. */
export async function send(routeId: string, payloadB64: string): Promise<{ ok: boolean; error?: string }> {
  const r = await rpc<any>('app_message', { route_id: routeId, message: payloadB64 })
  return { ok: r.ok, error: r.error }
}
