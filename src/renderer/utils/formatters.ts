// Shared formatting utilities to avoid duplication across components

/**
 * Format duration in seconds to human-readable string (HH:MM:SS or MM:SS)
 */
export function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return ''
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Format bytes to human-readable string (KB, MB, GB, etc.)
 */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

