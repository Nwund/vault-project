// File: src/main/services/ipc-lazy-router.ts
//
// #333 F-109 — Lazy-register IPC handlers behind a router. ipc.ts is
// ~10k lines and eagerly imports every service at boot, paying RAM
// + startup latency for IPCs that are rarely called (export
// pipeline, IMAP watcher, Tor, WebTransport, video-diffusion, …).
//
// This router lets callers register a channel WITHOUT importing the
// implementation:
//
//   lazyRouter.register('exportPipeline:run', () => import('./export-pipeline').then(m => m.runPipeline))
//
// First invocation triggers the dynamic import; subsequent calls
// re-use the cached factory output. ipc.ts can replace eagerly-
// registered handlers with calls to this router incrementally.

import { ipcMain, IpcMainInvokeEvent } from 'electron'

type LazyFactory<T extends (...args: any[]) => any> = () => Promise<T>

interface Entry {
  factory: LazyFactory<any>
  cached: any | null
  inFlight: Promise<any> | null
}

const registry = new Map<string, Entry>()

export function register<T extends (event: IpcMainInvokeEvent, ...args: any[]) => any>(channel: string, factory: LazyFactory<T>): void {
  if (registry.has(channel)) return
  registry.set(channel, { factory, cached: null, inFlight: null })
  ipcMain.handle(channel, async (event, ...args) => {
    const entry = registry.get(channel)!
    if (!entry.cached) {
      if (!entry.inFlight) entry.inFlight = entry.factory()
      entry.cached = await entry.inFlight
      entry.inFlight = null
    }
    return entry.cached(event, ...args)
  })
}

export function registerBatch(map: Record<string, LazyFactory<any>>): void {
  for (const [channel, factory] of Object.entries(map)) register(channel, factory)
}

export function stats(): { totalRegistered: number; loadedChannels: string[] } {
  const loaded: string[] = []
  for (const [ch, entry] of registry) if (entry.cached) loaded.push(ch)
  return { totalRegistered: registry.size, loadedChannels: loaded }
}
