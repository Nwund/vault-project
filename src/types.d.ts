declare module 'better-sqlite3' {
  namespace Database {
    type Database = any
  }
  function Database(filename: string, options?: any): any
  export = Database
}

declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string }
  export = ffprobeStatic
}

declare module 'canvas-confetti' {
  function confetti(options?: any): Promise<null>
  namespace confetti {
    function create(canvas: HTMLCanvasElement, options?: any): typeof confetti
  }
  export = confetti
}

// Window.api uses 'any' because:
// 1. The API is defined in preload/index.ts with full type exports
// 2. App.tsx uses window.api.invoke() for many handlers not in the typed API
// 3. Full strict typing would require significant refactoring
// See src/preload/index.ts for the full typed API definition
interface Window {
  api: any
  vaultDiagnostics: {
    getSnapshot: () => Promise<any>
    onEvent: (cb: (ev: any) => void) => () => void
    onToggle: (cb: (enabled: boolean) => void) => () => void
    log: (level: 'info' | 'warn' | 'error', message: string, meta?: any) => Promise<void>
  }
}
