// File: vault-mobile/utils/media.ts
// Media-related utility functions

export type MediaType = 'video' | 'image' | 'gif'

// File extension to type mapping
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', '3gp', 'wmv', 'flv']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heics', 'bmp', 'tiff', 'avif']
const GIF_EXTENSIONS = ['gif']

/**
 * Determine media type from filename
 */
export function getMediaType(filename: string): MediaType {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (GIF_EXTENSIONS.includes(ext)) return 'gif'
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'

  // Default to image if unknown
  return 'image'
}

/**
 * Check if file is a video
 */
export function isVideo(filename: string): boolean {
  return getMediaType(filename) === 'video'
}

/**
 * Check if file is an image
 */
export function isImage(filename: string): boolean {
  const type = getMediaType(filename)
  return type === 'image' || type === 'gif'
}

/**
 * Check if file is a GIF
 */
export function isGif(filename: string): boolean {
  return getMediaType(filename) === 'gif'
}

/**
 * Get icon name for media type
 */
export function getMediaIcon(type: MediaType): string {
  switch (type) {
    case 'video':
      return 'videocam'
    case 'gif':
      return 'infinite'
    case 'image':
    default:
      return 'image'
  }
}

/**
 * Get color for media type
 */
export function getMediaColor(type: MediaType): string {
  switch (type) {
    case 'video':
      return '#3b82f6'
    case 'gif':
      return '#a855f7'
    case 'image':
    default:
      return '#22c55e'
  }
}

/**
 * Get MIME type from extension
 */
export function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Video
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    '3gp': 'video/3gpp',

    // Image
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    avif: 'image/avif',
  }

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
}

/**
 * Get aspect ratio string
 */
export function getAspectRatioString(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

/**
 * Calculate thumbnail dimensions maintaining aspect ratio
 */
export function calculateThumbnailSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight)
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  }
}

/**
 * Sort media items by type (videos first, then images, then gifs)
 */
export function sortByMediaType<T extends { type: MediaType }>(items: T[]): T[] {
  const order: Record<MediaType, number> = { video: 0, image: 1, gif: 2 }
  return [...items].sort((a, b) => order[a.type] - order[b.type])
}

/**
 * Filter items by media type
 */
export function filterByType<T extends { type: MediaType }>(
  items: T[],
  types: MediaType[]
): T[] {
  return items.filter((item) => types.includes(item.type))
}
