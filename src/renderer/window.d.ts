// File: src/renderer/window.d.ts
//
// Renderer-only Window.api typing. Augments the global Window
// interface with the actual `Api` type inferred from
// src/preload/index.ts (which itself uses `export type Api = typeof
// api`). The intersection with `Record<string, any>` keeps the
// existing dynamic-invoke + arbitrary IPC access from breaking — it's
// deliberately loose so we don't have to type every generic
// `window.api.invoke(...)` call site.
//
// Lives in src/renderer/ rather than src/types.d.ts because src/
// types.d.ts is an ambient script-mode .d.ts (no top-level imports)
// that ships `declare module 'better-sqlite3'` etc. Adding an
// `import` there would flip it to module-mode and break those.

import type { Api } from '../preload'

declare global {
  interface Window {
    api: Api & Record<string, any>
  }
}

export {}
