// File: src/main/diagnostics.ts
import { BrowserWindow, ipcMain } from 'electron'

export type DiagnosticLevel = 'info' | 'warn' | 'error'
export type DiagnosticEvent = {
  ts: number
  level: DiagnosticLevel
  source: 'main' | 'renderer'
  message: string
  meta?: Record<string, unknown>
}

type DiagnosticsSnapshot = {
  pid: number
  windows: Array<{ id: number; title: string; url: string }>
}

const BUFFER_MAX = 500
const buffer: DiagnosticEvent[] = []
let overlayEnabled = false
let registered = false

function push(ev: DiagnosticEvent) {
  buffer.push(ev)
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX)
}

function broadcast(channel: string, ...args: any[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

export function logMain(level: DiagnosticLevel, message: string, meta?: Record<string, unknown>) {
  const ev: DiagnosticEvent = { ts: Date.now(), level, source: 'main', message, meta }
  push(ev)
  broadcast('diagnostics:event', ev)
}

export function broadcastToggle() {
  overlayEnabled = !overlayEnabled
  const ev: DiagnosticEvent = {
    ts: Date.now(),
    level: 'info',
    source: 'main',
    message: overlayEnabled ? 'Diagnostics overlay enabled' : 'Diagnostics overlay disabled'
  }
  push(ev)
  broadcast('diagnostics:toggle')
  broadcast('diagnostics:event', ev)
}

function snapshot(): DiagnosticsSnapshot {
  const wins = BrowserWindow.getAllWindows().map((w) => ({
    id: w.id,
    title: w.getTitle(),
    url: w.webContents.getURL()
  }))
  return { pid: process.pid, windows: wins }
}

export function registerDiagnosticsIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('diagnostics:log', async (_evt, raw) => {
    const level = (raw?.level ?? 'info') as DiagnosticLevel
    const message = String(raw?.message ?? '')
    const meta = (raw?.meta ?? undefined) as Record<string, unknown> | undefined
    const ev: DiagnosticEvent = { ts: Date.now(), level, source: 'renderer', message, meta }
    push(ev)
    broadcast('diagnostics:event', ev)
    return { ok: true as const }
  })

  ipcMain.handle('diagnostics:getSnapshot', async () => {
    return { snapshot: snapshot(), buffer: [...buffer] }
  })
}

export function registerDiagnosticsIpcOnce() {
  registerDiagnosticsIpc()
}