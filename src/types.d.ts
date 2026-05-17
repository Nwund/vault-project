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

// Window.api type lives in src/renderer/window.d.ts so this file
// stays an ambient script (the `declare module 'better-sqlite3'` etc.
// stanzas above require it). The Window.api type uses the inferred
// `Api` type from src/preload/index.ts so wrong-path bridge calls
// (e.g. window.api.foo when it lives at window.api.tags.foo) are
// caught at compile time — preventing the class of bugs uncovered in
// the v2.7 integration sweep.
interface Window {
  api: any
  vaultDiagnostics: {
    getSnapshot: () => Promise<any>
    onEvent: (cb: (ev: any) => void) => () => void
    onToggle: (cb: (enabled: boolean) => void) => () => void
    log: (level: 'info' | 'warn' | 'error', message: string, meta?: any) => Promise<void>
  }
}
