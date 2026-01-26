// File: src/renderer/vaultDiagnostics.d.ts
export {}

declare global {
  type DiagnosticLevel = 'info' | 'warn' | 'error'
  type DiagnosticEvent = {
    ts: number
    level: DiagnosticLevel
    source: 'main' | 'renderer'
    message: string
    meta?: Record<string, unknown>
  }

  interface Window {
    vaultDiagnostics: {
      getSnapshot: () => Promise<{ snapshot: unknown; buffer: DiagnosticEvent[] }>
      onEvent: (cb: (ev: DiagnosticEvent) => void) => () => void
      onToggle: (cb: () => void) => () => void
      log: (level: DiagnosticLevel, message: string, meta?: Record<string, unknown>) => void
    }
  }
}