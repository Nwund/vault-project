// File: src/renderer/utils/api.ts
//
// Tiny IPC result helpers. Extracted from App.tsx as part of #48 phase A.
// `extractItems` normalizes between bare-array and {items} response
// shapes returned by various IPCs. `toFileUrl` is a sync path→file URL
// helper for JSX (the async cached version lives in hooks/usePerformance).

export type ApiListResult<T> = T[] | { items?: T[]; media?: T[] }

export function extractItems<T>(result: ApiListResult<T>): T[] {
  if (Array.isArray(result)) return result
  return (result as { items?: T[]; media?: T[] })?.items
    ?? (result as { items?: T[]; media?: T[] })?.media
    ?? []
}

/** Sync path → file URL for JSX. Use `toFileUrlCached` (from
 *  hooks/usePerformance) when you can await — it caches the conversion. */
export function toFileUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('file://')) return path
  if (path.startsWith('blob:')) return path
  return `file:///${path.replace(/\\/g, '/')}`
}
