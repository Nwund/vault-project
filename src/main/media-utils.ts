import path from 'node:path'

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.m4v', '.webm', '.avi'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.heic'])
const GIF_EXT = new Set(['.gif'])

export function classifyMedia(filePath: string): { type: 'video' | 'image' | 'gif' | null; ext: string } {
  const ext = path.extname(filePath).toLowerCase()
  if (VIDEO_EXT.has(ext)) return { type: 'video', ext }
  if (GIF_EXT.has(ext)) return { type: 'gif', ext }
  if (IMAGE_EXT.has(ext)) return { type: 'image', ext }
  return { type: null, ext }
}
