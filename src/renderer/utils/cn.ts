// File: src/renderer/utils/cn.ts
//
// Conditional className concatenation. Shared across the renderer —
// before extraction (#48 phase A) this was inline in App.tsx, PmvEditor,
// and VirtualizedMediaGrid as three separate local copies.

export function cn(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ')
}
