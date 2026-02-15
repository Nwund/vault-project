// File: vault-mobile/utils/format.ts
// Formatting utility functions

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Format duration in seconds to readable string
 */
export function formatDuration(seconds: number, options?: { verbose?: boolean }): string {
  if (!seconds || seconds < 0) return '0:00'

  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (options?.verbose) {
    const parts: string[] = []
    if (hrs > 0) parts.push(`${hrs}h`)
    if (mins > 0) parts.push(`${mins}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
    return parts.join(' ')
  }

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number | Date): string {
  const now = Date.now()
  const date = timestamp instanceof Date ? timestamp.getTime() : timestamp
  const diff = now - date

  // Future dates
  if (diff < 0) {
    return 'In the future'
  }

  // Less than a minute
  if (diff < 60000) {
    return 'Just now'
  }

  // Minutes
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return `${mins} ${mins === 1 ? 'min' : 'mins'} ago`
  }

  // Hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }

  // Yesterday
  if (diff < 172800000) {
    return 'Yesterday'
  }

  // Days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days} days ago`
  }

  // Weeks
  if (diff < 2592000000) {
    const weeks = Math.floor(diff / 604800000)
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
  }

  // Full date
  return new Date(date).toLocaleDateString()
}

/**
 * Format date to localized string
 */
export function formatDate(
  timestamp: number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  })
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Remove file extension from filename
 */
export function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}
