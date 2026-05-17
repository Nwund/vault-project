// File: src/main/services/webrtc-bridge.ts
//
// #277 C-53 — WebRTC data-channel direct P2P file fetch. This is a
// MAIN-process bridge: the actual peer connection runs in the
// renderer (browsers have native WebRTC; node-wrtc is a heavyweight
// native dep). Main holds the signaling channel and shuttles
// SDP offers/answers between the local renderer and a remote peer.
//
// Two signaling transports:
//   1. Existing webhook-receiver (used as a relay):
//      remote POSTs offer, our renderer answers, we POST answer back.
//   2. Hyperswarm mesh frames (already trusted-device-paired):
//      \x03<json-utf8>\n frames carry SDP and ICE candidates.
//
// Files are sent as a sequence of binary frames over the data channel;
// the renderer assembles them to disk via the showSaveFilePicker IPC.
// File transfer protocol (renderer-side) is opaque to main.

import * as crypto from 'node:crypto'
import { broadcast as meshBroadcast, onPeerEvent } from './hyperswarm-mesh'

export interface SignalingFrame {
  kind: 'offer' | 'answer' | 'ice'
  sessionId: string
  payload: string                // JSON-encoded SDP or ICE candidate
}

type SignalHandler = (frame: SignalingFrame, source: 'mesh' | 'webhook', peerFingerprint?: string) => void

const handlers = new Set<SignalHandler>()

export function onSignalingFrame(h: SignalHandler): () => void {
  handlers.add(h)
  return () => handlers.delete(h)
}

export function sendSignalViaMesh(frame: SignalingFrame): void {
  meshBroadcast({ kind: 'webrtc-signal', frame })
}

export function newSessionId(): string {
  return crypto.randomUUID()
}

let listenerAttached = false

export function attachMeshSignaling(): void {
  if (listenerAttached) return
  listenerAttached = true
  // Subscribe to mesh peer events; actual frame parsing happens in
  // hyperswarm-mesh's per-socket data handler, but we expose this
  // public attach point so the main module can wire it up at boot.
  onPeerEvent(() => { /* peer join/leave events forwarded elsewhere */ })
}

/** Renderer calls this when an offer arrives from a remote peer; the
 *  renderer-side wrtc code prepares an answer and we ship it back. */
export function emitIncomingSignal(frame: SignalingFrame, source: 'mesh' | 'webhook', peerFingerprint?: string): void {
  for (const h of handlers) {
    try { h(frame, source, peerFingerprint) } catch { /* ignore */ }
  }
}
